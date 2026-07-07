import { defineConfig } from 'vite'

// Le WebView Android de Capacitor (schéma https://localhost) rejette les
// requêtes en mode CORS déclenchées par l'attribut `crossorigin` que Vite
// ajoute aux balises <script type="module"> / <link modulepreload>. Résultat :
// le bundle d'entrée ne se charge pas et l'app affiche un écran blanc au
// démarrage. On retire donc `crossorigin` du HTML généré.
function stripCrossorigin () {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml (html) {
      return html.replace(/\s+crossorigin(=(?:"[^"]*"|'[^']*'))?/g, '')
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [stripCrossorigin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2019',
    modulePreload: { polyfill: false }
  }
})
