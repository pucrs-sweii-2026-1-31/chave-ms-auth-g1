module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  testPathIgnorePatterns: ["/node_modules/", "/test/"],
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts"],
  testEnvironment: "node",
};
