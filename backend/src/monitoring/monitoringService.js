/**
 * Comprehensive Monitoring & Alerting for Phase 5
 */

const logger = require('../utils/logger');
const { EventEmitter } = require('events');

class MonitoringService extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.alertRules = [];
    this.dashboards = {};
    this.setupDefaultMetrics();
  }

  /**
   * Setup default metrics collection
   */
  setupDefaultMetrics() {
    // API Performance Metrics
    this.registerMetric('api.request.count', 'counter');
    this.registerMetric('api.request.duration', 'histogram', { buckets: [10, 50, 100, 500, 1000, 5000] });
    this.registerMetric('api.request.errors', 'counter');
    this.registerMetric('api.request.by_endpoint', 'counter');

    // Game Metrics
    this.registerMetric('game.active_tables', 'gauge');
    this.registerMetric('game.total_players', 'gauge');
    this.registerMetric('game.hand_duration', 'histogram', { buckets: [5000, 10000, 20000, 30000] });
    this.registerMetric('game.pot_distribution', 'histogram');

    // Security Metrics
    this.registerMetric('security.auth_attempts', 'counter');
    this.registerMetric('security.failed_auth', 'counter');
    this.registerMetric('security.rate_limit_hits', 'counter');
    this.registerMetric('security.2fa_enabled', 'gauge');
    this.registerMetric('security.cheat_detections', 'counter');
    this.registerMetric('security.suspicious_ips', 'gauge');

    // System Metrics
    this.registerMetric('system.cpu_usage', 'gauge');
    this.registerMetric('system.memory_usage', 'gauge');
    this.registerMetric('system.disk_usage', 'gauge');
    this.registerMetric('system.connections.active', 'gauge');

    // Database Metrics
    this.registerMetric('database.query_duration', 'histogram', { buckets: [10, 50, 100, 500] });
    this.registerMetric('database.pool_connections', 'gauge');
    this.registerMetric('database.connection_errors', 'counter');

    // WebSocket Metrics
    this.registerMetric('websocket.connections.active', 'gauge');
    this.registerMetric('websocket.messages.sent', 'counter');
    this.registerMetric('websocket.messages.received', 'counter');
    this.registerMetric('websocket.disconnections', 'counter');

    // Financial Metrics
    this.registerMetric('financial.total_wagered', 'counter');
    this.registerMetric('financial.total_winnings_paid', 'counter');
    this.registerMetric('financial.deposits', 'counter');
    this.registerMetric('financial.withdrawals', 'counter');
  }

  /**
   * Register a metric
   */
  registerMetric(name, type, options = {}) {
    this.metrics.set(name, {
      type,
      value: type === 'gauge' ? 0 : [],
      options,
      createdAt: new Date(),
    });
  }

  /**
   * Record metric value
   */
  recordMetric(name, value, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric) {
      logger.warn(`Metric ${name} not registered`);
      return;
    }

    const timestamp = Date.now();

    switch (metric.type) {
      case 'counter':
        metric.value = (metric.value || 0) + value;
        break;
      case 'gauge':
        metric.value = value;
        break;
      case 'histogram':
        metric.value.push({ value, timestamp, labels });
        // Keep last 1000 samples
        if (metric.value.length > 1000) {
          metric.value.shift();
        }
        break;
    }

    // Check alert rules
    this.checkAlertRules(name, value, labels);
  }

  /**
   * Setup alert rules
   */
  setupAlertRules() {
    // API Performance Alerts
    this.addAlertRule({
      name: 'high_api_latency',
      metric: 'api.request.duration',
      condition: (value) => value > 5000,
      severity: 'warning',
      message: 'API response time exceeds 5 seconds',
    });

    this.addAlertRule({
      name: 'high_error_rate',
      metric: 'api.request.errors',
      condition: (value) => value > 100,
      severity: 'critical',
      message: 'API error count exceeds 100',
    });

    // Security Alerts
    this.addAlertRule({
      name: 'high_failed_auth',
      metric: 'security.failed_auth',
      condition: (value) => value > 50,
      severity: 'critical',
      message: 'High failed authentication attempts detected',
    });

    this.addAlertRule({
      name: 'cheat_detection_spike',
      metric: 'security.cheat_detections',
      condition: (value) => value > 10,
      severity: 'warning',
      message: 'Unusual spike in cheat detections',
    });

    // System Alerts
    this.addAlertRule({
      name: 'high_cpu_usage',
      metric: 'system.cpu_usage',
      condition: (value) => value > 80,
      severity: 'warning',
      message: 'CPU usage exceeds 80%',
    });

    this.addAlertRule({
      name: 'high_memory_usage',
      metric: 'system.memory_usage',
      condition: (value) => value > 85,
      severity: 'critical',
      message: 'Memory usage exceeds 85%',
    });

    // Database Alerts
    this.addAlertRule({
      name: 'slow_db_queries',
      metric: 'database.query_duration',
      condition: (value) => value > 1000,
      severity: 'warning',
      message: 'Database query exceeds 1 second',
    });

    this.addAlertRule({
      name: 'db_connection_errors',
      metric: 'database.connection_errors',
      condition: (value) => value > 5,
      severity: 'critical',
      message: 'Database connection errors detected',
    });

    // WebSocket Alerts
    this.addAlertRule({
      name: 'ws_disconnection_spike',
      metric: 'websocket.disconnections',
      condition: (value) => value > 100,
      severity: 'warning',
      message: 'Unexpected spike in WebSocket disconnections',
    });
  }

  /**
   * Add alert rule
   */
  addAlertRule(rule) {
    this.alertRules.push(rule);
  }

  /**
   * Check alert rules
   */
  checkAlertRules(metricName, value, labels) {
    const triggeredRules = this.alertRules.filter(
      rule => rule.metric === metricName && rule.condition(value)
    );

    triggeredRules.forEach(rule => {
      this.triggerAlert(rule, value, labels);
    });
  }

  /**
   * Trigger alert
   */
  triggerAlert(rule, value, labels) {
    const alert = {
      rule: rule.name,
      severity: rule.severity,
      message: rule.message,
      value,
      labels,
      timestamp: new Date(),
    };

    logger.error(`ALERT [${rule.severity.toUpperCase()}]: ${rule.message}`, {
      rule: rule.name,
      value,
      labels,
    });

    this.emit('alert', alert);

    // Send to external monitoring service
    this.sendToMonitoringService(alert);
  }

  /**
   * Send alert to external monitoring service (DataDog, New Relic, etc.)
   */
  sendToMonitoringService(alert) {
    // Implementation would integrate with:
    // - DataDog API
    // - New Relic API
    // - CloudWatch
    // - PagerDuty (for critical alerts)
  }

  /**
   * Get metrics snapshot
   */
  getMetricsSnapshot() {
    const snapshot = {};
    for (const [name, metric] of this.metrics) {
      snapshot[name] = {
        type: metric.type,
        value: metric.type === 'histogram' ? this.calculateHistogramStats(metric.value) : metric.value,
      };
    }
    return snapshot;
  }

  /**
   * Calculate histogram statistics
   */
  calculateHistogramStats(samples) {
    if (samples.length === 0) return null;

    const values = samples.map(s => s.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      min: values[0],
      max: values[values.length - 1],
      mean: sum / values.length,
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
    };
  }

  /**
   * Create custom dashboard
   */
  createDashboard(name, config) {
    this.dashboards[name] = {
      name,
      config,
      createdAt: new Date(),
      panels: [],
    };
  }

  /**
   * Add panel to dashboard
   */
  addPanel(dashboardName, panel) {
    if (this.dashboards[dashboardName]) {
      this.dashboards[dashboardName].panels.push(panel);
    }
  }

  /**
   * Setup default dashboards
   */
  setupDefaultDashboards() {
    // API Performance Dashboard
    this.createDashboard('api-performance', {
      description: 'API request rates, latencies, and error rates',
    });

    this.addPanel('api-performance', {
      title: 'Request Rate',
      metric: 'api.request.count',
      type: 'graph',
    });

    this.addPanel('api-performance', {
      title: 'Response Latency',
      metric: 'api.request.duration',
      type: 'graph',
    });

    this.addPanel('api-performance', {
      title: 'Error Rate',
      metric: 'api.request.errors',
      type: 'graph',
    });

    // Security Dashboard
    this.createDashboard('security', {
      description: 'Security metrics and threat indicators',
    });

    this.addPanel('security', {
      title: 'Failed Auth Attempts',
      metric: 'security.failed_auth',
      type: 'graph',
    });

    this.addPanel('security', {
      title: 'Rate Limit Hits',
      metric: 'security.rate_limit_hits',
      type: 'graph',
    });

    this.addPanel('security', {
      title: 'Cheat Detections',
      metric: 'security.cheat_detections',
      type: 'graph',
    });

    // System Health Dashboard
    this.createDashboard('system-health', {
      description: 'System resource utilization',
    });

    this.addPanel('system-health', {
      title: 'CPU Usage',
      metric: 'system.cpu_usage',
      type: 'gauge',
    });

    this.addPanel('system-health', {
      title: 'Memory Usage',
      metric: 'system.memory_usage',
      type: 'gauge',
    });

    this.addPanel('system-health', {
      title: 'Active Connections',
      metric: 'system.connections.active',
      type: 'graph',
    });

    // Game Metrics Dashboard
    this.createDashboard('game-metrics', {
      description: 'Game activity and player engagement',
    });

    this.addPanel('game-metrics', {
      title: 'Active Tables',
      metric: 'game.active_tables',
      type: 'gauge',
    });

    this.addPanel('game-metrics', {
      title: 'Total Players',
      metric: 'game.total_players',
      type: 'gauge',
    });

    this.addPanel('game-metrics', {
      title: 'Hand Duration',
      metric: 'game.hand_duration',
      type: 'histogram',
    });
  }

  /**
   * Export metrics in Prometheus format
   */
  getPrometheusMetrics() {
    let output = '';

    for (const [name, metric] of this.metrics) {
      const promName = name.replace(/\./g, '_');

      if (metric.type === 'counter') {
        output += `# HELP ${promName} Counter metric\n`;
        output += `# TYPE ${promName} counter\n`;
        output += `${promName} ${metric.value}\n\n`;
      } else if (metric.type === 'gauge') {
        output += `# HELP ${promName} Gauge metric\n`;
        output += `# TYPE ${promName} gauge\n`;
        output += `${promName} ${metric.value}\n\n`;
      } else if (metric.type === 'histogram') {
        const stats = this.calculateHistogramStats(metric.value);
        output += `# HELP ${promName} Histogram metric\n`;
        output += `# TYPE ${promName} histogram\n`;
        if (stats) {
          output += `${promName}_sum ${metric.value.reduce((a, b) => a + b.value, 0)}\n`;
          output += `${promName}_count ${metric.value.length}\n`;
        }
        output += `\n`;
      }
    }

    return output;
  }

  /**
   * Health check endpoint
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date(),
      metrics: this.getMetricsSnapshot(),
      alerts: this.alertRules.length,
    };
  }
}

module.exports = new MonitoringService();
