$(document).ready(function () {
    const cameraView = $('#camera-view');
    const contactsView = $('#contacts-view');
    const cameraPreview = $('#camera-preview')[0];
    const captureBtn = $('#capture-btn');
    const sendBtn = $('#send-btn');
    const contactsList = $('#contacts-list');

    let stream;
    let selectedContacts = [];

    // Sample contacts (in a real app, this would come from a server)
    const contacts = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
    ];

    function initCamera() {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(function (mediaStream) {
                stream = mediaStream;
                cameraPreview.srcObject = stream;
            })
            .catch(function (error) {
                console.error('Error accessing camera:', error);
            });
    }

    function populateContacts() {
        contacts.forEach(function (contact) {
            contactsList.append(`<li data-id="${contact.id}">${contact.name}</li>`);
        });
    }

    captureBtn.on('click', function () {
        // In a real app, you'd capture the image here
        cameraView.addClass('hidden');
        contactsView.removeClass('hidden');
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
    });

    sendBtn.on('click', function () {
        if (selectedContacts.length > 0) {
            // In a real app, you'd send the image to selected contacts here
            alert('Snap sent to ' + selectedContacts.length + ' contact(s)!');
            // Reset the app state
            selectedContacts = [];
            contactsList.find('li').removeClass('selected');
            contactsView.addClass('hidden');
            cameraView.removeClass('hidden');
        } else {
            alert('Please select at least one contact.');
        }
    });

    // Initialize the app
    initCamera();
    populateContacts();

    // Service Worker registration for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(function (registration) {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(function (error) {
                console.error('Service Worker registration failed:', error);
            });
    }
});