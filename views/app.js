// Global variables
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

// Function declarations
function initCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser doesn't support camera access, or the page is not being served over HTTPS.");
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function (mediaStream) {
            stream = mediaStream;
            $('#camera-preview')[0].srcObject = stream;
        })
        .catch(function (error) {
            console.error('Error accessing camera:', error);
            alert("An error occurred while trying to access the camera: " + error.message);
        });
}

function captureImage() {
    const cameraPreview = $('#camera-preview')[0];
    const captureCanvas = $('#capture-canvas')[0];
    const context = captureCanvas.getContext('2d');
    captureCanvas.width = cameraPreview.videoWidth;
    captureCanvas.height = cameraPreview.videoHeight;
    context.drawImage(cameraPreview, 0, 0, captureCanvas.width, captureCanvas.height);
    return captureCanvas.toDataURL('image/jpeg');
}

function populateContacts() {
    const contactsList = $('#contacts-list');
    contactsList.empty();
    contacts.forEach(function (contact) {
        contactsList.append(`<li data-id="${contact.id}">${contact.name}</li>`);
    });
}

function populateMessages() {
    const messagesList = $('#messages-list');
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

function resetView() {
    $('#camera-view').removeClass('hidden');
    $('#send-photo-view').addClass('hidden');
    selectedContacts = [];
    capturedImageData = null;
    $('#send-btn').prop('disabled', true);
}
async function subscribeToPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications are not supported in this environment');
        return;
    }
    try {
        const response = await fetch('https://pics.phantomfiles.io/vapid-public-key');
        if (!response.ok) {
            throw new Error('Failed to fetch VAPID public key');
        }
        const applicationServerKey = await response.text();
        console.log('Received VAPID public key:', applicationServerKey);

        const registration = await navigator.serviceWorker.register('/service-worker.js');
        console.log('Service Worker registered');

        await navigator.serviceWorker.ready;
        console.log('Service Worker is ready');

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });
            console.log('New push subscription created:', subscription);
        } else {
            console.log('Using existing push subscription:', subscription);
        }

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
        console.log('Subscription sent to server, response:', subscribeData);

        if (Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();
            console.log('Notification permission status:', permission);
            if (permission !== 'granted') {
                console.warn('Notification permission not granted');
            }
        }
    } catch (error) {
        console.error('Error during push subscription:', error);
    }
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

    $('#messages-list').on('click', '.view-photo-btn', function () {
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

// Document ready function
$(document).ready(function () {
    // DOM-dependent initializations and event bindings
    initCamera();
    populateContacts();
    populateMessages();
    initializePhotoViewer();

    $('#capture-btn').on('click', function () {
        capturedImageData = captureImage();
        $('#captured-image').attr('src', capturedImageData);
        $('#camera-view').addClass('hidden');
        $('#send-photo-view').removeClass('hidden');
        populateContacts();
    });

    $('#contacts-list').on('click', 'li', function () {
        $(this).toggleClass('selected');
        const contactId = $(this).data('id');
        const index = selectedContacts.indexOf(contactId);
        if (index > -1) {
            selectedContacts.splice(index, 1);
        } else {
            selectedContacts.push(contactId);
        }
        $('#send-btn').prop('disabled', selectedContacts.length === 0);
    });

    $('#send-btn').on('click', async function () {
        if (selectedContacts.length > 0) {
            try {
                await sendPhoto(capturedImageData, selectedContacts);
                alert('Photo sent successfully!');
                resetView();
            } catch (error) {
                alert('Failed to send photo: ' + error.message);
            }
        }
    });

    $('#cancel-btn').on('click', function () {
        resetView();
    });

    // Menu navigation
    $('#camera-btn').on('click', function () {
        $('.active').removeClass('active');
        $(this).addClass('active');
        resetView();
    });

    $('#contacts-btn').on('click', function () {
        $('.active').removeClass('active');
        $(this).addClass('active');
        $('#camera-view').addClass('hidden');
        $('#send-photo-view').addClass('hidden');
        $('#contacts-view').removeClass('hidden');
        $('#messages-view').addClass('hidden');
        populateContacts();
    });

    $('#messages-btn').on('click', function () {
        $('.active').removeClass('active');
        $(this).addClass('active');
        $('#camera-view').addClass('hidden');
        $('#send-photo-view').addClass('hidden');
        $('#contacts-view').addClass('hidden');
        $('#messages-view').removeClass('hidden');
        populateMessages();
    });

});

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

// Subscribe to push notifications
subscribeToPushNotifications();

