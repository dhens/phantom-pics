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

    let stream;
    let capturedImageData;
    let selectedContacts = [];

    // Sample contacts (in a real app, this would come from a server)
    const contacts = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
    ];

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
            messagesList.append(`<li data-id="${message.id}">From: ${message.from} - Status: ${message.status}</li>`);
        });
    }

    function sendPhoto(imageData, recipients) {
        // In a real app, replace this URL with your actual backend endpoint
        const backendUrl = 'https://api.example.com/send-photo';

        return fetch(backendUrl, {
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
                return data;
            })
            .catch(error => {
                console.error('Error sending photo:', error);
                throw error;
            });
    }

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
        contactsView.removeClass('hidden');
        messagesView.addClass('hidden');
        populateContacts();
    });

    $('#messages-btn').on('click', function () {
        $('.active').removeClass('active');
        $(this).addClass('active');
        cameraView.addClass('hidden');
        sendPhotoView.addClass('hidden');
        contactsView.addClass('hidden');
        messagesView.removeClass('hidden');
        populateMessages();
    });

    // Initialize the app
    initCamera();
    populateContacts();
    populateMessages();


    // Initialize the app
    initCamera();
});