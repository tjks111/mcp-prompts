export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/src', '<rootDir>/tests', '<rootDir>/custom-mcp'], // Added custom-mcp to roots
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Keep this for .js extensions in imports
    '^custom-mcp/(.*)$': '<rootDir>/custom-mcp/$1', // Added for custom-mcp path
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$', // This should find the test file
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  coverageReporters: ['text', 'lcov', 'json-summary'], // Added json-summary
  coverageDirectory: '<rootDir>/coverage', // Explicit root coverage dir
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '<rootDir>/custom-mcp/**/*.js', // Collect coverage from custom-mcp js files
    '!<rootDir>/custom-mcp/node_modules/**',
    '!<rootDir>/custom-mcp/coverage/**',
  ],
  coveragePathIgnorePatterns: [ // More explicit ignore patterns
    '/node_modules/',
    '/coverage/'
  ]
};