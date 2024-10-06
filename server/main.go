package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
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
	Image      string   `json:"image"`
	Recipients []string `json:"recipients"`
}

type Subscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

var subscriptions = make(map[string]*webpush.Subscription)

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://pics.phantomfiles.io"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Post("/send-photo", handlePhotoUpload)
	r.Post("/subscribe", handleSubscribe)
	r.Get("/photo/{filename}", servePhoto)
	r.Get("/", helloWorld)

	// Create autocert manager
	certManager := autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		HostPolicy: autocert.HostWhitelist("phantomfiles.io"), // Subdomains are not supported
		Cache:      autocert.DirCache("tls-certs"),            // Folder to store certificates
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
			sendPushNotification(sub, photoUrl)
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
	userID := fmt.Sprintf("user_%d", len(subscriptions)+1)
	subscriptions[userID] = &sub

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"userId": userID})
}

func sendPushNotification(sub *webpush.Subscription, photoUrl string) {
	// Read private key from file
	privateKeyBytes, err := ioutil.ReadFile("./vapid-keys/vapid_private_key.pem")
	if err != nil {
		log.Fatalf("Failed to read private key: %v", err)
	}
	privateKeyBase64 := base64.StdEncoding.EncodeToString(privateKeyBytes)

	// Read public key from file
	publicKeyBytes, err := ioutil.ReadFile("./vapid-keys/vapid_public_key.pem")
	if err != nil {
		log.Fatalf("Failed to read public key: %v", err)
	}
	publicKeyBase64 := base64.StdEncoding.EncodeToString(publicKeyBytes)

	// In a real app, you'd want to store these securely
	privateKey := privateKeyBase64
	publicKey := publicKeyBase64

	// Prepare the notification payload
	payload := map[string]interface{}{
		"type":     "RECEIVED_PHOTO",
		"from":     "Someone", // In a real app, this would be the sender's name
		"imageUrl": photoUrl,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal notification payload: %v", err)
		return
	}

	// Send Notification
	resp, err := webpush.SendNotification(payloadBytes, sub, &webpush.Options{
		Subscriber:      "notifications@phantompics.pages.dev",
		VAPIDPublicKey:  publicKey,
		VAPIDPrivateKey: privateKey,
		TTL:             30,
	})
	if err != nil {
		log.Printf("Failed to send notification: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		log.Printf("Unexpected status code: %d", resp.StatusCode)
	}
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

func helloWorld(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Hello, world!")
}
