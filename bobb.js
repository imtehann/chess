// Background Music (Beethoven's Moonlight Sonata)
const bgMusic = new Audio('https://upload.wikimedia.org/wikipedia/commons/1/1d/Beethoven_-_Piano_Sonata_No._14_-_Movement_1.ogg');
bgMusic.loop = true;
bgMusic.volume = 0.25; // Gentle background volume

// Play on first click to comply with browser policies
document.addEventListener('click', () => {
    bgMusic.play().catch(e => console.log("Audio playback waiting for interaction."));
}, { once: true });

// Hook into your existing sound select option
const soundControl = document.getElementById('soundSelect');
if (soundControl) {
    soundControl.addEventListener('change', (e) => {
        if (e.target.value === 'on') bgMusic.play();
        else bgMusic.pause();
    });
}