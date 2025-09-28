# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

**[CUSTOMIZE]** This adapter is for controlling Xiaomi Mi Home smart plugs (wifi). It allows controlling simple and 6x plugs with ioBroker. The adapter communicates with Xiaomi plugs using UDP packets and requires a token for authentication. It can control power on/off states, monitor temperature, and manage wifi LED indicators. The adapter supports both single plugs and power strips with multiple outlets.

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }
});
```

#### Promisified Harness Operations
Always wrap callback-based harness operations in Promises:

```javascript
// Getting objects
const obj = await new Promise((resolve, reject) => {
    harness.objects.getObject(objectId, (err, obj) => {
        if (err) return reject(err);
        resolve(obj);
    });
});

// Getting states
const state = await new Promise((resolve, reject) => {
    harness.states.getState(stateId, (err, state) => {
        if (err) return reject(err);
        resolve(state);
    });
});
```

#### Error Handling Best Practices
- Always use proper error handling with try-catch blocks
- Provide descriptive error messages for test failures
- Use timeout values appropriate for the tested functionality
- Include debugging information in test outputs

#### Configuration Testing
Test different adapter configurations:

```javascript
// Test with minimal configuration
Object.assign(obj.native, {
    ip: '192.168.1.100',
    port: 54321,
    token: 'test_token_32_characters_long'
});
```

### Hardware Testing Considerations
**[CUSTOMIZE]** For Mi Home plug adapter testing:
- Mock UDP socket communications to avoid requiring physical devices
- Provide sample response data from actual Xiaomi plugs for realistic testing
- Test token validation and encryption/decryption processes
- Simulate network timeouts and connection failures
- Test different plug types (single outlet vs power strips)
- Validate temperature monitoring and power consumption data parsing

## Development Standards

### ioBroker Adapter Structure
- Extend the official `@iobroker/adapter-core` base class
- Implement required lifecycle methods: `onReady()`, `onStateChange()`, `onUnload()`
- Use proper state management with `setState()` and `getState()`
- Handle configuration through `this.config` object
- Implement proper logging using `this.log.info()`, `this.log.error()`, etc.

### Configuration Management
- Define all configuration options in `io-package.json` under `common.native`
- Validate configuration parameters on adapter startup
- Provide meaningful default values
- Support encrypted configuration fields for sensitive data like tokens

### State Management
- Create states with proper roles and types as defined in ioBroker state types
- Use meaningful state IDs following ioBroker naming conventions
- Set states with acknowledgment flags appropriately
- Implement state subscriptions for user interactions

### Error Handling
- Implement comprehensive error handling for all external communications
- Use appropriate log levels (debug, info, warn, error)
- Handle network timeouts and connection failures gracefully
- Provide user-friendly error messages in logs

### Resource Cleanup
- Properly close all connections, timers, and intervals in `onUnload()`
- Clear all pending timeouts and intervals
- Gracefully disconnect from external services
- Example cleanup implementation:
```javascript
async onUnload(callback) {
  try {
    // Clear intervals and timeouts
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    
    // Close connections
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
    
    // Set connection state to false
    await this.setStateAsync('info.connection', false, true);
    
    callback();
  } catch (e) {
    callback();
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

**[CUSTOMIZE]** For the mihome-plug adapter, consider these specific testing patterns:
- Mock UDP socket communication for unit tests
- Test token-based authentication without requiring physical devices
- Test packet parsing and command building functionality
- Simulate device responses for various plug types and states
- Test timeout handling for unresponsive devices