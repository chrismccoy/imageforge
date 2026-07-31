/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./screenshots/index.html", "./screenshots/gallery.js"],
  theme: {
    extend: {
      colors: {
        bg: "#f5f5f7",
        text: "#1d1d1f",
        accent: "#0071e3",
        muted: "#6e6e73",
        brand: {
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      borderRadius: {
        pill: "100px",
      },
      boxShadow: {
        "bento-sm": "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)",
        "bento-md": "0 4px 16px rgba(0,0,0,0.08), 0 16px 40px rgba(0,0,0,0.07)",
      },
    },
  },
};
