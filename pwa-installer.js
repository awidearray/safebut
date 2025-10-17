// PWA Install Prompt Handler (Premium Feature)
let deferredPrompt;
let installButton = null;

// Check if user is premium
function isPremiumUser() {
  return localStorage.getItem('isPremium') === 'true';
}

// Check if app is already installed
function isAppInstalled() {
  // For iOS
  if (window.navigator.standalone === true) {
    return true;
  }
  // For Android/Desktop with display-mode
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  return false;
}

// Create install banner (Premium only)
function createInstallBanner() {
  if (!isPremiumUser()) {
    return; // Only show to premium users
  }
  
  if (isAppInstalled()) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="install-banner-content">
      <div class="install-banner-icon">
        <img src="/logo.png" alt="Safe Maternity" width="40" height="40">
      </div>
      <div class="install-banner-text">
        <div class="install-banner-title">Install Safe Maternity</div>
        <div class="install-banner-subtitle">Add to home screen for quick access & offline use</div>
      </div>
      <div class="install-banner-actions">
        <button id="install-dismiss-btn" class="install-dismiss-btn">Later</button>
        <button id="install-app-btn" class="install-app-btn">Install</button>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .pwa-install-banner {
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      background: var(--background-primary, white);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      padding: 16px;
      z-index: 9999;
      animation: slideUp 0.4s ease-out;
      max-width: 480px;
      margin: 0 auto;
    }

    @keyframes slideUp {
      from {
        transform: translateY(100px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .install-banner-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .install-banner-icon img {
      border-radius: 8px;
    }

    .install-banner-text {
      flex: 1;
    }

    .install-banner-title {
      font-weight: 600;
      font-size: 16px;
      color: var(--text-primary, #333);
      margin-bottom: 4px;
    }

    .install-banner-subtitle {
      font-size: 13px;
      color: var(--text-secondary, #666);
    }

    .install-banner-actions {
      display: flex;
      gap: 8px;
    }

    .install-dismiss-btn {
      padding: 8px 16px;
      background: transparent;
      border: none;
      color: var(--text-secondary, #666);
      cursor: pointer;
      font-size: 14px;
    }

    .install-app-btn {
      padding: 8px 20px;
      background: var(--primary-color, #b8956a);
      border: none;
      color: white;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
    }

    .install-app-btn:hover {
      opacity: 0.9;
    }

    /* iOS specific instructions */
    .ios-install-instructions {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .ios-install-content {
      background: white;
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }

    .ios-install-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #333;
    }

    .ios-install-steps {
      text-align: left;
      margin: 20px 0;
    }

    .ios-install-step {
      display: flex;
      align-items: flex-start;
      margin-bottom: 16px;
      gap: 12px;
    }

    .ios-install-step-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .ios-install-step-text {
      font-size: 15px;
      color: #555;
      line-height: 1.5;
    }

    .ios-close-btn {
      padding: 12px 32px;
      background: #b8956a;
      border: none;
      color: white;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 16px;
    }

    @media (max-width: 768px) {
      .pwa-install-banner {
        bottom: 10px;
        left: 10px;
        right: 10px;
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(banner);

  // Add event listeners
  document.getElementById('install-dismiss-btn').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('pwa-install-dismissed', Date.now());
  });

  document.getElementById('install-app-btn').addEventListener('click', () => {
    if (deferredPrompt) {
      installPWA();
    } else if (isIOS()) {
      showIOSInstructions();
    }
    banner.remove();
  });

  installButton = document.getElementById('install-app-btn');
}

// Check if iOS
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Show iOS installation instructions
function showIOSInstructions() {
  const modal = document.createElement('div');
  modal.className = 'ios-install-instructions';
  modal.innerHTML = `
    <div class="ios-install-content">
      <div class="ios-install-title">📱 Install Safe Maternity</div>
      <div class="ios-install-steps">
        <div class="ios-install-step">
          <span class="ios-install-step-icon">1️⃣</span>
          <span class="ios-install-step-text">Tap the <strong>Share</strong> button at the bottom of Safari</span>
        </div>
        <div class="ios-install-step">
          <span class="ios-install-step-icon">2️⃣</span>
          <span class="ios-install-step-text">Scroll down and tap <strong>"Add to Home Screen"</strong></span>
        </div>
        <div class="ios-install-step">
          <span class="ios-install-step-icon">3️⃣</span>
          <span class="ios-install-step-text">Tap <strong>"Add"</strong> to install the app</span>
        </div>
      </div>
      <button class="ios-close-btn" onclick="this.parentElement.parentElement.remove()">Got it!</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// Handle the install prompt (Premium only)
window.addEventListener('beforeinstallprompt', (e) => {
  // Only allow premium users to install
  if (!isPremiumUser()) {
    return;
  }
  
  // Prevent the default prompt
  e.preventDefault();
  // Store the event for later use
  deferredPrompt = e;
  
  // Check if user dismissed the banner recently (within 7 days)
  const dismissed = localStorage.getItem('pwa-install-dismissed');
  if (dismissed && (Date.now() - parseInt(dismissed)) < 7 * 24 * 60 * 60 * 1000) {
    return;
  }

  // Show install banner after a delay
  setTimeout(() => {
    if (!isAppInstalled() && isPremiumUser()) {
      createInstallBanner();
    }
  }, 3000);
});

// Install the PWA
async function installPWA() {
  if (!deferredPrompt) {
    return;
  }

  // Show the install prompt
  deferredPrompt.prompt();
  
  // Wait for the user to respond
  const { outcome } = await deferredPrompt.userChoice;
  
  if (outcome === 'accepted') {
    console.log('User accepted the install prompt');
  } else {
    console.log('User dismissed the install prompt');
  }
  
  // Clear the deferred prompt
  deferredPrompt = null;
}

// Handle successful installation
window.addEventListener('appinstalled', (evt) => {
  console.log('App installed successfully');
  // Remove any install UI
  const banner = document.getElementById('pwa-install-banner');
  if (banner) {
    banner.remove();
  }
});

// Register service worker (Premium only)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Only register service worker for premium users
    if (!isPremiumUser()) {
      console.log('Service Worker registration skipped - Premium feature only');
      return;
    }
    
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful (Premium)');
        
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
  
  // Handle service worker updates
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing && isPremiumUser()) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Add bookmark reminder for desktop premium users
function showBookmarkReminder() {
  // Only show to premium users
  if (!isPremiumUser()) {
    return;
  }
  
  if (isAppInstalled() || window.innerWidth <= 768) {
    return;
  }

  const reminderShown = sessionStorage.getItem('bookmark-reminder-shown');
  if (reminderShown) {
    return;
  }

  setTimeout(() => {
    const reminder = document.createElement('div');
    reminder.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--primary-color, #b8956a);
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 9998;
      max-width: 320px;
      animation: slideIn 0.4s ease-out;
    `;
    
    reminder.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 24px;">⭐</span>
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">Bookmark this page!</div>
          <div style="font-size: 13px; opacity: 0.9;">Press Ctrl+D (or Cmd+D on Mac) for quick access</div>
        </div>
        <button onclick="this.parentElement.parentElement.remove(); sessionStorage.setItem('bookmark-reminder-shown', 'true');" 
                style="background: none; border: none; color: white; cursor: pointer; font-size: 18px; padding: 0; margin-left: 8px;">✕</button>
      </div>
    `;
    
    document.body.appendChild(reminder);
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
      if (reminder.parentElement) {
        reminder.style.animation = 'slideOut 0.4s ease-out';
        setTimeout(() => reminder.remove(), 400);
      }
    }, 8000);
    
    sessionStorage.setItem('bookmark-reminder-shown', 'true');
  }, 5000);
}

// Show bookmark reminder on page load
window.addEventListener('load', showBookmarkReminder);
