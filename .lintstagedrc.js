const path = require("path");

const buildNextEslintCommand = (filenames) => {
  const files = filenames
    .map((f) => path.relative(path.join("packages", "nextjs"), f))
    .join(" ");
  return `yarn workspace @se-2/nextjs eslint --fix ${files}`;
};

const checkTypesNextCommand = () => "yarn next:check-types";

const buildHardhatEslintCommand = (filenames) =>
  `yarn hardhat:lint-staged --fix ${filenames
    .map((f) => path.relative(path.join("packages", "hardhat"), f))
    .join(" ")}`;

module.exports = {
  "packages/nextjs/**/*.{ts,tsx}": [
    buildNextEslintCommand,
    checkTypesNextCommand,
  ],
  "packages/hardhat/**/*.{ts,tsx}": [buildHardhatEslintCommand],
};
