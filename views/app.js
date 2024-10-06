$(document).ready(function () {
    const cameraView = $('#camera-view');
    const sendPhotoView = $('#send-photo-view');
    const cameraPreview = $('#camera-preview')[0];
    const captureCanvas = $('#capture-canvas')[0];
    const capturedImage = $('#captured-image');
    const captureBtn = $('#capture-btn');
    const sendBtn = $('#send-btn');
    const cancelBtn = $('#cancel-btn');
    const contactsList = $('#contacts-list');
    const messagesView = $('#messages-view');
    const messagesList = $('#messages-list');

    let stream;
    let capturedImageData;
    let selectedContacts = [];

    // Sample contacts (in a real app, this would come from a server)
    const contacts = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
    ];

    // Sample messages (in a real app, this would come from a server)
    let messages = [];

    function initCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Your browser doesn't support camera access, or the page is not being served over HTTPS.");
            return;
        }

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(function (mediaStream) {
                stream = mediaStream;
                cameraPreview.srcObject = stream;
            })
            .catch(function (error) {
                console.error('Error accessing camera:', error);
                alert("An error occurred while trying to access the camera: " + error.message);
            });
    }

    function captureImage() {
        const context = captureCanvas.getContext('2d');
        captureCanvas.width = cameraPreview.videoWidth;
        captureCanvas.height = cameraPreview.videoHeight;
        context.drawImage(cameraPreview, 0, 0, captureCanvas.width, captureCanvas.height);
        return captureCanvas.toDataURL('image/jpeg');
    }

    function populateContacts() {
        contactsList.empty();
        contacts.forEach(function (contact) {
            contactsList.append(`<li data-id="${contact.id}">${contact.name}</li>`);
        });
    }

    function populateMessages() {
        messagesList.empty();
        messages.forEach(function (message) {
            const listItem = $(`<li data-id="${message.id}">
                From: ${message.from} - Status: ${message.status}
                ${message.imageUrl ? `<img src="${message.imageUrl}" alt="Received photo" style="max-width: 100px; max-height: 100px;">` : ''}
                ${message.status === 'received' ? '<button class="view-photo-btn">View Photo</button>' : ''}
            </li>`);
            messagesList.append(listItem);
        });
    }

    async function sendPhoto(imageData, recipients) {
        const backendUrl = 'https://pics.phantomfiles.io/send-photo';

        return await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageData,
                recipients: recipients
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                console.log('Photo sent successfully:', data);
                // Add the sent photo to the messages list
                messages.push({
                    id: Date.now(),
                    from: 'Me',
                    status: 'sent',
                    imageUrl: imageData
                });
                populateMessages();
                return data;
            })
            .catch(error => {
                console.error('Error sending photo:', error);
                throw error;
            });
    }

    sendBtn.on('click', async function () {
        if (selectedContacts.length > 0) {
            await sendPhoto(capturedImageData, selectedContacts)
                .then((data) => {
                    console.log('Photo sent successfully:', data);
                    alert('Photo sent successfully!');
                    // Add the sent photo to the messages list
                    messages.push({
                        id: Date.now(),
                        from: 'Me',
                        status: 'sent',
                        imageUrl: capturedImageData
                    });
                    populateMessages();
                    resetView();
                })
                .catch(error => {
                    console.error('Error sending photo:', error);
                    alert('Failed to send photo: ' + error.message);
                });
        }
    });


    captureBtn.on('click', function () {
        capturedImageData = captureImage();
        capturedImage.attr('src', capturedImageData);
        cameraView.addClass('hidden');
        sendPhotoView.removeClass('hidden');
        populateContacts();
    });

    contactsList.on('click', 'li', function () {
        $(this).toggleClass('selected');
        const contactId = $(this).data('id');
        const index = selectedContacts.indexOf(contactId);
        if (index > -1) {
            selectedContacts.splice(index, 1);
        } else {
            selectedContacts.push(contactId);
        }
        sendBtn.prop('disabled', selectedContacts.length === 0);
    });

    sendBtn.on('click', function () {
        if (selectedContacts.length > 0) {
            sendPhoto(capturedImageData, selectedContacts)
                .then(() => {
                    alert('Photo sent successfully!');
                    resetView();
                })
                .catch(error => {
                    alert('Failed to send photo: ' + error.message);
                });
        }
    });

    cancelBtn.on('click', function () {
        resetView();
    });

    function resetView() {
        cameraView.removeClass('hidden');
        sendPhotoView.addClass('hidden');
        selectedContacts = [];
        capturedImageData = null;
        sendBtn.prop('disabled', true);
    }

    // Menu navigation
    $('#camera-btn').on('click', function () {
        $('.active').removeClass('active');
        $(this).addClass('active');
        resetView();
    });

    $('#contacts-btn').on('click', function () {
        $('.active').removeClass('active');
        $(this).addClass('active');
        cameraView.addClass('hidden');
        sendPhotoView.addClass('hidden');
        $('#contacts-view').removeClass('hidden');
        messagesView.addClass('hidden');
        populateContacts();
    });

    $('#messages-btn').on('click', function () {
        $('.active').removeClass('active');
        $(this).addClass('active');
        cameraView.addClass('hidden');
        sendPhotoView.addClass('hidden');
        $('#contacts-view').addClass('hidden');
        messagesView.removeClass('hidden');
        populateMessages();
    });

    // Handle viewing received photos
    messagesList.on('click', '.view-photo-btn', function () {
        const messageId = $(this).closest('li').data('id');
        const message = messages.find(m => m.id === messageId);
        if (message && message.imageUrl) {
            window.open(message.imageUrl, '_blank');
        }
    });

    // Initialize the app
    initCamera();
    populateContacts();
    populateMessages();

    // Subscribe to push notifications
    async function subscribeToPushNotifications() {
        if (!('serviceWorker' in navigator) || !('PushManager' in self)) {
            console.warn('Push notifications are not supported in this environment');
            return;
        }

        try {
            // Fetch the VAPID public key from the server
            const response = await fetch('https://pics.phantomfiles.io/vapid-public-key');
            const publicVapidKey = await response.text();

            // Register service worker
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('Service Worker registered');

            // Subscribe to push notifications
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array(publicVapidKey)
            });
            console.log('Push subscription successful', subscription);

            // Send the subscription to the server
            const subscribeResponse = await fetch('https://pics.phantomfiles.io/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription)
            });

            if (!subscribeResponse.ok) {
                throw new Error('Failed to send subscription to server');
            }

            const subscribeData = await subscribeResponse.json();
            console.log('Subscription sent to server', subscribeData);
        } catch (error) {
            console.error('Error during push subscription:', error);
        }
    }

    // Call the function to subscribe to push notifications
    subscribeToPushNotifications();

    // Listen for push notifications
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', function (event) {
            if (event.data && event.data.type === 'RECEIVED_PHOTO') {
                const { from, imageUrl } = event.data;
                messages.push({
                    id: Date.now(),
                    from: from,
                    status: 'received',
                    imageUrl: imageUrl
                });
                populateMessages();
            }
        });
    }

    function initializePhotoViewer() {
        const photoModal = $('#photo-modal');
        const modalImage = $('#modal-image');
        const countdownTimer = $('#countdown-timer');
        let countdownInterval;

        function showPhoto(imageUrl) {
            modalImage.attr('src', imageUrl);
            photoModal.removeClass('hidden');
            startCountdown(10);
        }

        function hidePhoto() {
            photoModal.addClass('hidden');
            modalImage.attr('src', '');
            clearInterval(countdownInterval);
        }

        function startCountdown(seconds) {
            let remainingSeconds = seconds;
            updateCountdown(remainingSeconds);

            countdownInterval = setInterval(() => {
                remainingSeconds--;
                if (remainingSeconds < 0) {
                    clearInterval(countdownInterval);
                    hidePhoto();
                } else {
                    updateCountdown(remainingSeconds);
                }
            }, 1000);
        }

        function updateCountdown(seconds) {
            countdownTimer.text(`Closing in ${seconds} seconds`);
        }

        messagesList.on('click', '.view-photo-btn', function () {
            const messageId = $(this).closest('li').data('id');
            const message = messages.find(m => m.id === messageId);
            if (message && message.imageUrl) {
                showPhoto(message.imageUrl);
            }
        });

        photoModal.on('click', function (e) {
            if (e.target === this) {
                hidePhoto();
            }
        });
    }
    // Initialize the photo viewer
    initializePhotoViewer();

    // Helper function to convert base64 string to Uint8Array
    function urlB64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // Listen for push notifications
    navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'RECEIVED_PHOTO') {
            const { from, imageUrl } = event.data;
            messages.push({
                id: Date.now(),
                from: from,
                status: 'received',
                imageUrl: imageUrl
            });
            populateMessages();
        }
    });
});