function loadPhoto(photoUrl) {
    // Implement this function to display the photo in your UI
    console.log('Loading photo:', photoUrl);
    // For example:
    $('#photo-viewer').attr('src', photoUrl).show();

    // Clear the badge when the photo is viewed
    if ('clearAppBadge' in navigator) {
        navigator.clearAppBadge().catch(error => console.error('Error clearing badge:', error));
    }
}


// Check for photo parameter in URL when page loads
$(document).ready(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const photoUrl = urlParams.get('photo');
    if (photoUrl) {
        loadPhoto(decodeURIComponent(photoUrl));
    }
});
