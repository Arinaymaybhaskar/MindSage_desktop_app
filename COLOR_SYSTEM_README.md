# MindSage Color Customization System

## Overview

The MindSage app now includes a comprehensive color customization system that allows users to personalize the app's appearance by choosing from preset themes or creating their own custom color schemes. All colors are automatically applied throughout the entire application using CSS custom properties (variables).

## Features

### 🎨 Preset Themes
- **Default**: Original MindSage color scheme
- **Ocean**: Blue and teal tones for a calming experience
- **Sunset**: Warm orange and yellow tones
- **Forest**: Green and nature-inspired colors
- **Purple**: Purple and violet tones for creativity

### 🛠️ Custom Colors
- Individual color pickers for each accent color
- Separate light and dark mode color customization
- Live preview of color changes
- Real-time application of changes

### 💾 Persistence
- Colors are automatically saved to localStorage
- Settings persist across app sessions
- Colors are applied immediately on app startup

## How It Works

### 1. CSS Variables System
The app uses CSS custom properties defined in `src/index.css`:

```css
@theme {
  --color-light1: hsl(232, 33%, 75%);
  --color-light2: hsl(191, 26%, 82%);
  --color-light3: hsl(120, 24%, 87%);
  --color-light4: hsl(68, 48%, 90%);
  --color-dark1: hsl(235, 17%, 25%);
  --color-dark2: hsl(202, 25%, 27%);
  --color-dark3: hsl(193, 21%, 40%);
  --color-dark4: hsl(136, 17%, 55%);
}
```

### 2. Dynamic Color Application
Colors are applied dynamically using JavaScript:

```typescript
const applyColorsToDocument = (colors: ColorTheme) => {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });
};
```

### 3. Component Usage
Components use the CSS variables for consistent theming:

```tsx
<div style={{ backgroundColor: 'var(--color-light1)' }}>
  This will use the user's chosen light1 color
</div>
```

## File Structure

```
src/
├── components/
│   ├── settings/
│   │   └── ColorSettings.tsx          # Main color settings UI
│   └── ColorSystemDemo.tsx            # Demo component
├── context/
│   └── ColorThemeContext.tsx          # React context for color management
├── hooks/
│   └── useColorTheme.ts               # Custom hook for color operations
├── utils/
│   └── colorInitializer.ts            # App startup color initialization
└── index.css                          # CSS variables definition
```

## Usage

### For Users
1. Navigate to **Settings** → **Colors**
2. Choose from preset themes or customize individual colors
3. Colors are applied immediately and saved automatically
4. Changes persist across app sessions

### For Developers

#### Using Colors in Components
```tsx
// Use CSS variables in styles
<div className="bg-light1">  // If using Tailwind with CSS variables
<div style={{ backgroundColor: 'var(--color-light1)' }}>  // Direct CSS

// Use the color context
import { useColorThemeContext } from '../context/ColorThemeContext';

const MyComponent = () => {
  const { colorSettings } = useColorThemeContext();
  // Access current color settings
};
```

#### Adding New Preset Themes
Add to the `PRESET_THEMES` array in `ColorSettings.tsx`:

```typescript
{
  name: "My Theme",
  colors: {
    light1: "hsl(200, 50%, 70%)",
    light2: "hsl(180, 40%, 75%)",
    // ... other colors
  },
}
```

#### Adding New Color Variables
1. Add the variable to `src/index.css`:
```css
--color-new-variable: hsl(0, 0%, 50%);
```

2. Update the `ColorTheme` interface in `useColorTheme.ts`
3. Add color picker to `ColorSettings.tsx`

## Technical Details

### Color Storage
- Colors are stored in `localStorage` under the key `colorTheme`
- Format: JSON object with `customColors`, `selectedTheme`, and `useCustomColors`

### Performance
- Colors are applied once on app startup
- Changes are applied immediately without page refresh
- Minimal performance impact using CSS custom properties

### Browser Support
- Uses modern CSS custom properties
- Supported in all modern browsers
- Graceful fallback to default colors if localStorage fails

## Integration Points

The color system integrates with:
- **Settings Page**: Color customization UI
- **App Startup**: Automatic color initialization
- **All Components**: Via CSS variables
- **Dark/Light Mode**: Separate color sets for each mode

## Future Enhancements

Potential improvements:
- Color accessibility validation
- Import/export color themes
- More preset themes
- Color animation transitions
- Advanced color picker (HSL, RGB, etc.)
- Color contrast checking

## Troubleshooting

### Colors Not Applying
1. Check browser console for errors
2. Verify localStorage is available
3. Ensure CSS variables are properly defined

### Performance Issues
1. Colors are applied once on startup
2. Use CSS variables instead of inline styles for better performance
3. Avoid frequent color changes in animations

### Browser Compatibility
- Ensure browser supports CSS custom properties
- Test in different browsers for consistency
