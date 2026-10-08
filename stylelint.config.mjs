const SCALED_SIZES = "/^(?:padding|margin|gap|row-gap|column-gap|inset|font-size)|^border(?:-[a-z]+)*-radius$/";
const CSS_WIDE_KEYWORDS = ["inherit", "initial", "unset", "revert"];
const RAW_COLOR = "Raw colors live only in tokens.css; use a var() token.";
const COLOR_FUNCTIONS = ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color"];

export default {
  extends: ["stylelint-config-standard"],
  plugins: ["stylelint-declaration-strict-value"],
  rules: {
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global"] }],
    "value-keyword-case": ["lower", { ignoreProperties: ["/^--font-/"] }],
    "lightness-notation": "number",
    "hue-degree-notation": "number",
    "alpha-value-notation": "number",
    "media-feature-range-notation": "prefix",
    "import-notation": "string",
    "custom-property-empty-line-before": null,
    "color-no-hex": [true, { message: RAW_COLOR }],
    "color-named": ["never", { message: RAW_COLOR }],
    "function-disallowed-list": [COLOR_FUNCTIONS, { message: RAW_COLOR }],
    "scale-unlimited/declaration-strict-value": [
      [SCALED_SIZES],
      {
        expandShorthand: true,
        ignoreValues: ["0", "auto", "/%$/", "/^-?(?:\\d|1[0-5])(?:\\.\\d+)?px$/", ...CSS_WIDE_KEYWORDS],
        message: "Sizes from 16px up come from tokens.css: use a var() token for ${property}: ${value}",
      },
    ],
  },
  overrides: [
    {
      files: ["src/web/styles/tokens.css"],
      rules: { "color-no-hex": null, "color-named": null, "function-disallowed-list": null },
    },
    {
      files: ["**/*.module.css"],
      rules: { "selector-class-pattern": "^(?:[a-z][a-zA-Z0-9]*|recharts-[a-z-]+)$" },
    },
  ],
};
