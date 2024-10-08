package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"log"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"
	"golang.org/x/crypto/acme/autocert"
)

type PhotoUpload struct {
	Image      string `json:"image"`
	Recipients []int  `json:"recipients"` // User IDs
}

type Subscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

var VAPID_PUBKEY string

var subscriptions = make(map[int]*webpush.Subscription)

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://phantompics.pages.dev"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Post("/send-photo", handlePhotoUpload)
	r.Post("/subscribe", handleSubscribe)
	r.Get("/photo/{filename}", servePhoto)
	r.Get("/vapid-public-key", serveVapidPublicKey)

	// Create autocert manager
	certManager := autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		HostPolicy: autocert.HostWhitelist("phantomfiles.io", "pics.phantomfiles.io"), // Subdomains are not supported
		Cache:      autocert.DirCache("tls-certs"),                                    // Folder to store certificates
	}

	server := &http.Server{
		Addr:      ":https",
		Handler:   r,
		TLSConfig: certManager.TLSConfig(),
	}

	// Start HTTP server to redirect to HTTPS
	go http.ListenAndServe(":http", certManager.HTTPHandler(nil))

	fmt.Println("Server is running on https://pics.phantomfiles.io") // Replace with your domain
	log.Fatal(server.ListenAndServeTLS("", ""))                      // Empty strings for cert and key files, as autocert manages them
}

func handlePhotoUpload(w http.ResponseWriter, r *http.Request) {
	var upload PhotoUpload
	err := json.NewDecoder(r.Body).Decode(&upload)
	if err != nil {
		slog.Error(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Save the image
	imageData := upload.Image[strings.IndexByte(upload.Image, ',')+1:]
	imgDecoded, err := base64.StdEncoding.DecodeString(imageData)
	if err != nil {
		http.Error(w, "Failed to decode image", http.StatusBadRequest)
		return
	}

	id := uuid.New()
	filename := fmt.Sprintf("%s:%d.jpg", id.String(), time.Now().UnixNano())
	filepath := filepath.Join("uploads", filename)
	err = os.MkdirAll("uploads", 0755)
	if err != nil {
		http.Error(w, "Failed to create upload directory", http.StatusInternalServerError)
		return
	}

	err = ioutil.WriteFile(filepath, imgDecoded, 0644)
	if err != nil {
		http.Error(w, "Failed to save image", http.StatusInternalServerError)
		return
	}

	// Send push notifications to recipients
	for _, recipient := range upload.Recipients {
		if sub, ok := subscriptions[recipient]; ok {
			photoUrl := fmt.Sprintf("https://pics.phantomfiles.io/photo/%s", filename)
			sendPushNotification(sub, photoUrl, 1)
		}
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Photo uploaded and notifications sent", "filename": filename})
}

func handleSubscribe(w http.ResponseWriter, r *http.Request) {
	var sub webpush.Subscription
	err := json.NewDecoder(r.Body).Decode(&sub)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// In a real app, you'd want to associate this with a user ID
	userID := len(subscriptions) + 1
	subscriptions[userID] = &sub

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]int{"userId": userID})
}

func pemToRawPublicKey(pemKey string) ([]byte, error) {
	block, _ := pem.Decode([]byte(pemKey))
	if block == nil {
		return nil, fmt.Errorf("failed to parse PEM block containing the public key")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse DER encoded public key: %v", err)
	}

	ecdsaPub, ok := pub.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("key is not an ECDSA public key")
	}

	return elliptic.Marshal(ecdsaPub.Curve, ecdsaPub.X, ecdsaPub.Y), nil
}

func pemToRawPrivateKey(pemKey string) ([]byte, error) {
	block, _ := pem.Decode([]byte(pemKey))
	if block == nil {
		return nil, fmt.Errorf("failed to parse PEM block containing the private key")
	}

	priv, err := x509.ParseECPrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse EC private key: %v", err)
	}

	return priv.D.Bytes(), nil
}

func sendPushNotification(sub *webpush.Subscription, photoUrl string, senderName int) error {
	// Read private key from file
	privateKeyBytes, err := ioutil.ReadFile("./vapid-keys/vapid_private_key.pem")
	if err != nil {
		return fmt.Errorf("failed to read private key: %v", err)
	}
	privateKeyRaw, err := pemToRawPrivateKey(string(privateKeyBytes))
	if err != nil {
		return fmt.Errorf("failed to convert private key pem to raw bytes: %v", err)
	}
	privateKeyBase64 := base64.RawURLEncoding.EncodeToString(privateKeyRaw)

	// Read public key from file
	publicKeyBytes, err := ioutil.ReadFile("./vapid-keys/vapid_public_key.pem")
	if err != nil {
		return fmt.Errorf("failed to read public key: %v", err)
	}
	publicKeyRaw, err := pemToRawPublicKey(string(publicKeyBytes))
	if err != nil {
		return fmt.Errorf("failed to convert public key pem to raw bytes: %v", err)
	}
	publicKeyBase64 := base64.RawURLEncoding.EncodeToString(publicKeyRaw)

	// Prepare the notification payload
	payload := map[string]interface{}{
		"type":     "RECEIVED_PHOTO",
		"from":     senderName,
		"imageUrl": photoUrl,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal notification payload: %v", err)
	}

	// Send Notification
	resp, err := webpush.SendNotification(payloadBytes, sub, &webpush.Options{
		Subscriber:      "notifications@phantompics.pages.dev",
		VAPIDPublicKey:  publicKeyBase64,
		VAPIDPrivateKey: privateKeyBase64,
		TTL:             30,
	})
	if err != nil {
		return fmt.Errorf("failed to send notification: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}

func servePhoto(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	filepath := filepath.Join("uploads", filename)

	// Validate the filename to prevent directory traversal attacks
	if !strings.HasPrefix(filepath, "uploads/") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	// Check if file exists
	if _, err := os.Stat(filepath); os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Serve the file
	http.ServeFile(w, r, filepath)
}

func serveVapidPublicKey(w http.ResponseWriter, r *http.Request) {
	var publicKeyBytes []byte
	var err error
	// if len(VAPID_PUBKEY) == 0 {
	publicKeyPath := "./vapid-keys/vapid_public_key.pem"
	publicKeyBytes, err = os.ReadFile(publicKeyPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	VAPID_PUBKEY = string(publicKeyBytes)
	// }
	if err != nil {
		http.Error(w, "Failed to read VAPID public key", http.StatusInternalServerError)
		return
	}

	// Decode PEM
	block, _ := pem.Decode([]byte(VAPID_PUBKEY))
	if block == nil {
		panic("failed to parse PEM block containing the public key")
	}

	// Parse the public key
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		panic("failed to parse DER encoded public key: " + err.Error())
	}

	// Convert to raw bytes
	rawBytes, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		panic("failed to marshal public key: " + err.Error())
	}

	// Take the last 65 bytes
	rawPublicKey := rawBytes[len(rawBytes)-65:]

	// Base64 URL encode
	encoded := base64.RawURLEncoding.EncodeToString(rawPublicKey)

	fmt.Fprint(w, encoded)
}
