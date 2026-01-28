# Environment Warning Browser Extension

A browser extension that helps developers easily switch between production and development environments while providing clear visual indicators of the current environment.

## Features

- 🚦 Clear visual indicators: Red banner for production, green for development environments
- 🔄 Quick environment switching with a single click
- 🎨 Customizable banner size and position (top or bottom of the page)
- 🔗 Maintains URL paths when switching environments
- 🎯 Support for multiple production-development URL pairs
- 🌐 Support for both Chrome and Firefox browsers
- 🔍 Wildcard domain pattern matching
- 🔒 Local storage variable monitoring
- 📍 Flexible banner positioning

## Installation

### Chrome Web Store (Coming Soon)
The extension will be available in the Chrome Web Store.

### Firefox Add-ons (Coming Soon)
The extension will be available in the Firefox Add-ons store.

### Manual Installation (Developer Mode)

#### Chrome
1. Run `npm run build:chrome` to build the extension
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked"
5. Select the `dist/chrome` folder

#### Firefox
1. Run `npm run build:firefox` to build the extension
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select any file from the `dist/firefox` folder

## Development Setup

### Prerequisites
- Node.js (v14 or higher)
- npm (v6 or higher)

### Project Structure
```
├── src/
│   ├── shared/           # Shared code between Chrome and Firefox
│   │   ├── banner/       # Banner UI components
│   │   │   ├── BannerRenderer.ts      # DOM creation & styling
│   │   │   ├── BannerPositioner.ts    # Layout adjustment
│   │   │   └── EnvironmentSwitcher.ts # URL switching logic
│   │   ├── storage/      # Storage utilities
│   │   │   └── StorageMonitor.ts      # localStorage monitoring
│   │   ├── utils/        # Shared utilities
│   │   │   └── patterns.ts            # Domain pattern matching
│   │   ├── content.ts    # Content script orchestrator
│   │   ├── background.ts # Background script
│   │   ├── options.ts    # Options page logic
│   │   ├── popup.ts      # Popup logic
│   │   ├── html/         # HTML templates
│   │   ├── css/          # Styles
│   │   └── images/       # Icons and images
│   └── platform/         # Platform-specific code
│       ├── chrome/       # Chrome-specific implementation
│       └── firefox/      # Firefox-specific implementation
├── dist/                 # Built extensions
│   ├── chrome/           # Chrome build output
│   └── firefox/          # Firefox build output
└── webpack configs       # Build configuration
```

### Build Commands
- `npm install` - Install dependencies
- `npm run build` - Build both Chrome and Firefox extensions
- `npm run build:chrome` - Build Chrome extension only
- `npm run build:firefox` - Build Firefox extension only
- `npm run watch:chrome` - Watch Chrome files and rebuild on changes
- `npm run watch:firefox` - Watch Firefox files and rebuild on changes
- `npm run package:chrome` - Create Chrome extension ZIP for store submission
- `npm run package:firefox` - Create Firefox extension ZIP for store submission

## Configuration

### Setting Up Environment Pairs
1. Click the extension icon in your browser toolbar
2. Click "Open Options" or right-click the extension icon and select "Options"
3. In the options page, you can:
   - Add production-development URL pairs
   - Configure banner sizes for both environments
   - Set banner position (top or bottom)
   - Configure localStorage variables to monitor

#### URL Pairs with Wildcards
You can use wildcards (*) to match dynamic parts of domains. For example:
```
Production URL                    Development URL
*.production.example.com         *.dev.example.com
*.bestcompany.io                       *.bestcompany.io.s3-website.eu-west-2.amazonaws.com
```
When switching environments, the extension will preserve the dynamic part that matches the wildcard.

### Local Storage Monitoring
You can configure specific localStorage keys to monitor. The extension will:
- Display the key-value pairs in the banner
- Show bright text when value is '1' or 'true'
- Show dim text when value is '0' or 'false'

Example keys to monitor:
```
bestcompany-production-enabled
use-prod-database
env-mode
```

### Banner Settings
You can customize:
- Banner position: Top or bottom of the page
- Banner size: 50px, 100px, or 150px (separate settings for production and development)

## Usage

### Visual Indicators
- **Red Banner**: Indicates you're on a production environment
- **Green Banner**: Indicates you're on a development environment
- **Warning Text**: Shows monitored localStorage values with brightness indicating their state

### Features
- The extension preserves your current path when switching environments
- New environment pages open in a new tab
- The banner adjusts the page layout automatically without breaking the site's design
- Fixed and absolute positioned elements are automatically adjusted to account for the banner
- Wildcard domain patterns allow matching dynamic subdomains
- Local storage monitoring provides visual feedback about environment configuration
- Banner can be positioned at top or bottom of the page

## Troubleshooting

If you encounter any issues:

1. **Banner Not Showing**:
   - Verify the extension is enabled
   - Check if the current URL matches your configured patterns
   - Try refreshing the page

2. **Layout Issues**:
   - Try refreshing the page
   - Check if the banner size setting is appropriate for the site
   - Try changing the banner position (top/bottom)

3. **Switching Not Working**:
   - Verify your URL pairs are correctly configured
   - Check if your wildcard patterns match the current URL

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
