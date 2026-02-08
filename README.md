# Wwiser

Modern Wwise utilities — a collection of productivity tools for Wwise sound designers, powered by WAAPI.

🌐 **Live at [wwiser.net](https://wwiser.net)**

## Features

### 🖥️ WAAPI Explorer

Interactive WAAPI explorer for Wwise. Test functions, subscribe to events, and learn the Wwise Authoring API in real-time.

### 🎁 Wrap

Quickly wrap selected Wwise objects in parent containers. Automatically group by naming patterns and create Random, Sequence, or Switch containers.

### 🔀 Assign

Automatically assign children of switch containers to their corresponding switches based on naming patterns. Configure switch groups and preview assignments before applying.

### 🔊 Volume

Calculate the final output volume of Wwise objects including all hierarchy and bus chain contributions. Visualize volume attenuation paths.

### ✏️ Rename

Batch rename multiple Wwise objects with powerful pattern matching. Use regex, find/replace, and preview changes before applying.

## Getting Started

### Installation

```sh
pnpm install
```

### Development

```sh
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building

```sh
pnpm build
```

Preview the production build:

```sh
pnpm preview
```

## Connecting to Wwise

**In Wwise (Project > User Preferences):**

1. Enable **Wwise Authoring API**
2. Set port to `8080` (default)
3. Add `https://wwiser.net` (or `http://localhost:5173` for local dev) to **Allow browser connections from**

**In Wwiser:**

1. Click the connection panel
2. Enter host (`localhost`) and port (`8080`)
3. Click **Connect**

## License

MIT
