# Environment Warning Browser Extension

A browser extension that helps developers easily switch between production and development environments while providing clear visual indicators of the current environment.

## Features

- 🚦 Clear visual indicators: Red banner for production, green for development environments
- 🔄 Quick environment switching with a single click
- ⌨️ Keyboard shortcut support (Ctrl+Shift+S or Cmd+Shift+S on Mac)
- 🎨 Customizable banner size
- 🔗 Maintains URL paths when switching environments
- 🎯 Support for multiple production-development URL pairs
- 🌐 Support for both Chrome and Firefox browsers

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
│   │   ├── content.ts    # Content script
│   │   ├── background.ts # Background script
│   │   ├── options.ts    # Options page logic
│   │   ├── popup.ts      # Popup logic
│   │   ├── html/         # HTML templates
│   │   ├── css/         # Styles
│   │   └── images/      # Icons and images
│   └── platform/        # Platform-specific code
│       ├── chrome/      # Chrome-specific implementation
│       └── firefox/     # Firefox-specific implementation
├── dist/               # Built extensions
│   ├── chrome/        # Chrome build output
│   └── firefox/       # Firefox build output
└── webpack configs    # Build configuration
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

Example URL pairs:
```
Production URL          Development URL
d.bestcomapny.io             dev.b.bestcomapny.io
analytics.bestcomapny.io     dev.analytics.bestcomapny.io
sblaze.bestcomapny.io        dev.sblaze.bestcomapny.io
```

### Banner Size Configuration
You can adjust the banner size for both production and development environments:
- Options: 50px, 100px, 150px
- Different sizes can be set for production and development environments

## Usage

### Visual Indicators
- **Red Banner**: Indicates you're on a production environment
- **Green Banner**: Indicates you're on a development environment

### Switching Environments
There are two ways to switch between environments:

1. **Using the Banner Button**:
   - Click the "Switch to Dev" button on production sites
   - Click the "Switch to Prod" button on development sites

2. **Using Keyboard Shortcut**:
   - TODO

### Features
- The extension preserves your current path when switching environments
- New environment pages open in a new tab
- The banner adjusts the page layout automatically without breaking the site's design
- Fixed and absolute positioned elements are automatically adjusted to account for the banner

## Technical Details

- Built with Manifest V3
- Uses Chrome Storage API for saving settings
- Implements a background service worker
- Handles complex DOM manipulations without breaking page layouts

## Troubleshooting

If you encounter any issues:

1. **Banner Not Showing**:
   - Verify the extension is enabled
   - Check if the current URL is in your configured pairs
   - Try refreshing the page

2. **Layout Issues**:
   - Try refreshing the page
   - Check if the banner size setting is appropriate for the site

3. **Switching Not Working**:
   - Verify your URL pairs are correctly configured
   - Ensure the URLs match exactly with your configuration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
