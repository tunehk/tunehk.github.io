# Tuneh Knott — Portfolio

Personal portfolio site. Plain HTML/CSS — no build step required.

## File Structure
```
tunehknott.github.io/
├── index.html          ← About page (home)
├── projects.html       ← Projects with card grid
├── style.css           ← Shared styles
├── images/
│   ├── me.jpg          ← Your photo (square, ~400px)
│   └── solar-pump-thumb.png  ← Project thumbnail (16:10 ratio)
└── solar-pump/         ← Separate repo, appears as subfolder
```

## Setup

### 1. Create the portfolio repo
Go to GitHub → New Repository → name it **`tunehknott.github.io`**
(replace with your actual GitHub username).

This special repo name makes it your root site.

### 2. Clone and add files
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_USERNAME.github.io.git
cd YOUR_USERNAME.github.io

# Copy index.html, projects.html, style.css into the repo
# Create images/ folder and add your photo + thumbnails
```

### 3. Add your photo
- Save a square photo as `images/me.jpg`
- Take a screenshot of your dashboard for `images/solar-pump-thumb.png`

### 4. Edit the content
- **index.html**: Update bio text, social links (GitHub, LinkedIn, email)
- **projects.html**: Add/remove project cards as you build things

### 5. Deploy
```bash
git add .
git commit -m "Initial portfolio"
git push origin main
```

Your site is live at `https://YOUR_USERNAME.github.io` within a few minutes.

Go to repo Settings → Pages → make sure Source is set to "Deploy from a branch" → main → / (root).

## Adding the Solar Pump Dashboard

### Option A: Subfolder in same repo
```bash
mkdir solar-pump
cd solar-pump
npm create vite@latest . -- --template react
npm install recharts
# Copy solar_pump_dashboard.jsx → src/App.jsx
# Set base: '/solar-pump/' in vite.config.js
npm run build
# Copy contents of dist/ back to solar-pump/ in portfolio repo
```

### Option B: Separate repo (recommended)
1. Create repo: `solar-pump` on GitHub
2. Set up as standalone Vite project
3. In `vite.config.js`: `base: '/solar-pump/'`
4. Deploy with gh-pages: `npm run deploy`
5. Accessible at `YOUR_USERNAME.github.io/solar-pump/`
6. Link from projects.html points to `./solar-pump/`

Option B is cleaner — each project is its own repo with its own build.

## Adding More Projects
Copy a `<li>` block in projects.html:
```html
<li>
  <a href="./project-folder/">
    <img src="images/thumb.png" alt="Description" />
    <h3>Project Title</h3>
    <p>Short description of what this project does.</p>
    <span class="tags">
      <span>Python</span>
      <span>D3</span>
    </span>
  </a>
</li>
```

Projects can be:
- React apps (Vite → build → deploy)
- Jupyter notebooks (export to HTML)
- Plain HTML/JS visualizations
- Links to external sites

## Customizing
- **Colors**: Edit CSS variables in `:root` in style.css
- **Fonts**: Change Google Fonts import in both HTML files
- **Layout**: Max width is set via `--max-w` (default 740px)
