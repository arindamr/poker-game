const logger = require('../utils/logger');

class EventEmitter {
  constructor() {
    this.events = {};
  }

  /**
   * Register an event listener
   */
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  /**
   * Register a one-time event listener
   */
  once(eventName, callback) {
    const onceWrapper = (...args) => {
      callback(...args);
      this.off(eventName, onceWrapper);
    };
    this.on(eventName, onceWrapper);
  }

  /**
   * Unregister an event listener
   */
  off(eventName, callback) {
    if (this.events[eventName]) {
      this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit an event
   */
  emit(eventName, ...args) {
    logger.debug(`Event emitted: ${eventName}`, { args });
    if (this.events[eventName]) {
      this.events[eventName].forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          logger.error(`Error in event listener for ${eventName}`, {
            error: error.message,
          });
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(eventName) {
    if (eventName) {
      delete this.events[eventName];
    } else {
      this.events = {};
    }
  }

  /**
   * Get listener count
   */
  listenerCount(eventName) {
    return this.events[eventName] ? this.events[eventName].length : 0;
  }
}

module.exports = EventEmitter;
