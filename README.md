# SUNGDANG

## Tailwind CSS in Production

The Tailwind CSS CDN link (`<script src="https://cdn.tailwindcss.com?plugins=typography"></script>`) has been removed from `index.html` as it's not recommended for production use.

To use Tailwind CSS in production, please follow the official installation guide: [https://tailwindcss.com/docs/installation](https://tailwindcss.com/docs/installation)

This typically involves:
1.  Installing Tailwind CSS and its peer dependencies via npm or yarn:
    ```bash
    npm install -D tailwindcss postcss autoprefixer
    npx tailwindcss init
    ```
2.  Configuring your `tailwind.config.js` file to include all of your template paths:
    ```js
    module.exports = {
      content: [
        "./*.html",
        "./**/*.js",
      ],
      theme: {
        extend: {},
      },
      plugins: [
        require('@tailwindcss/typography'),
      ],
    }
    ```
3.  Adding the Tailwind directives to your main CSS file (e.g., `style.css`):
    ```css
    @tailwind base;
    @tailwind components;
    @tailwind utilities;
    ```
4.  Compiling your CSS for production:
    ```bash
    npx tailwindcss -i ./style.css -o ./dist/style.css --minify
    ```
5.  Linking the generated CSS file (e.g., `dist/style.css`) in your `index.html`. Make sure your `style.css` does not contain the CDN script if you are using this method.

This project was using the typography plugin via the CDN. If you set it up locally, ensure you install and configure `@tailwindcss/typography`.