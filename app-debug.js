console.log('App debug script starting...');

// Simple test to ensure script runs
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    // Test tab functionality
    const tabButtons = document.querySelectorAll('.tab-btn');
    console.log('Found tab buttons:', tabButtons.length);
    
    tabButtons.forEach(button => {
        console.log('Tab button:', button.textContent, button.dataset.tab);
    });
    
    // Test search button
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        console.log('Search button found');
        searchBtn.addEventListener('click', () => {
            console.log('Search button clicked!');
            alert('Search button clicked!');
        });
    } else {
        console.error('Search button not found');
    }
    
    // Test example chips
    const chips = document.querySelectorAll('.chip');
    console.log('Found example chips:', chips.length);
    
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            console.log('Chip clicked:', chip.dataset.example);
            alert('Chip clicked: ' + chip.dataset.example);
        });
    });
});

console.log('App debug script loaded');