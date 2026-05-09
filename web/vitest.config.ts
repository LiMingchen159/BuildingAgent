const config = {
  plugins: [require("@vitejs/plugin-react")()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
};

export default config;
