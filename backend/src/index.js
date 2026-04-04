require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/infrawatch';

// Middleware
app.use(cors());
app.use(express.json());

// ─── Prometheus Metrics Setup ────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const metricsCounter = new client.Counter({
  name: 'infrawatch_metrics_received_total',
  help: 'Total number of metrics received from agents',
  labelNames: ['agentId'],
  registers: [register]
});

const cpuGauge = new client.Gauge({
  name: 'infrawatch_cpu_usage_percent',
  help: 'CPU usage percent per agent',
  labelNames: ['agentId'],
  registers: [register]
});

const memGauge = new client.Gauge({
  name: 'infrawatch_memory_usage_percent',
  help: 'Memory usage percent per agent',
  labelNames: ['agentId'],
  registers: [register]
});

// ─── MongoDB Schema ───────────────────────────────────────────
const metricSchema = new mongoose.Schema({
  agentId: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  cpu: {
    usage: Number,
    cores: Number,
    userLoad: Number,
    systemLoad: Number
  },
  memory: {
    total: Number,
    used: Number,
    free: Number,
    usagePercent: Number
  },
  disk: [{}],
  network: [{}],
  processes: {
    total: Number,
    running: Number,
    blocked: Number,
    sleeping: Number
  }
}, {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'agentId',
    granularity: 'seconds'
  }
});

// TTL index — auto delete metrics older than 7 days
metricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

const Metric = mongoose.model('Metric', metricSchema);

// Deployment event schema
const deploymentSchema = new mongoose.Schema({
  service: String,
  version: String,
  status: { type: String, enum: ['started', 'success', 'failed', 'rolled-back'] },
  triggeredBy: String,
  commitHash: String,
  timestamp: { type: Date, default: Date.now },
  duration: Number,
  notes: String
});

const Deployment = mongoose.model('Deployment', deploymentSchema);

// Alert schema
const alertSchema = new mongoose.Schema({
  agentId: String,
  type: { type: String, enum: ['cpu', 'memory', 'disk', 'network'] },
  severity: { type: String, enum: ['warning', 'critical'] },
  message: String,
  value: Number,
  threshold: Number,
  resolved: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  resolvedAt: Date
});

const Alert = mongoose.model('Alert', alertSchema);

// ─── Routes ───────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// POST /api/metrics — agent pushes metrics here
app.post('/api/metrics', async (req, res) => {
  try {
    const metric = new Metric(req.body);
    await metric.save();

    // Update Prometheus gauges
    metricsCounter.inc({ agentId: req.body.agentId });
    cpuGauge.set({ agentId: req.body.agentId }, req.body.cpu?.usage || 0);
    memGauge.set({ agentId: req.body.agentId }, req.body.memory?.usagePercent || 0);

    // Auto-generate alerts if thresholds crossed
    if (req.body.cpu?.usage > 80) {
      const alert = new Alert({
        agentId: req.body.agentId,
        type: 'cpu',
        severity: req.body.cpu.usage > 90 ? 'critical' : 'warning',
        message: `High CPU usage detected on ${req.body.agentId}`,
        value: req.body.cpu.usage,
        threshold: 80
      });
      await alert.save();
    }

    if (req.body.memory?.usagePercent > 85) {
      const alert = new Alert({
        agentId: req.body.agentId,
        type: 'memory',
        severity: req.body.memory.usagePercent > 95 ? 'critical' : 'warning',
        message: `High memory usage detected on ${req.body.agentId}`,
        value: req.body.memory.usagePercent,
        threshold: 85
      });
      await alert.save();
    }

    res.status(201).json({ success: true, id: metric._id });
  } catch (error) {
    console.error('Error saving metric:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/metrics — get latest metrics per agent
app.get('/api/metrics', async (req, res) => {
  try {
    const { agentId, limit = 100, from, to } = req.query;
    const query = {};
    if (agentId) query.agentId = agentId;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    const metrics = await Metric.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    res.json({ success: true, count: metrics.length, data: metrics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/metrics/summary — aggregated stats per agent
app.get('/api/metrics/summary', async (req, res) => {
  try {
    const summary = await Metric.aggregate([
      {
        $group: {
          _id: '$agentId',
          avgCpu: { $avg: '$cpu.usage' },
          maxCpu: { $max: '$cpu.usage' },
          avgMemory: { $avg: '$memory.usagePercent' },
          maxMemory: { $max: '$memory.usagePercent' },
          totalDataPoints: { $sum: 1 },
          lastSeen: { $max: '$timestamp' }
        }
      }
    ]);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/agents — list all active agents
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await Metric.distinct('agentId');
    res.json({ success: true, data: agents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/deployments — record a deployment event
app.post('/api/deployments', async (req, res) => {
  try {
    const deployment = new Deployment(req.body);
    await deployment.save();
    res.status(201).json({ success: true, data: deployment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/deployments — get deployment history
app.get('/api/deployments', async (req, res) => {
  try {
    const deployments = await Deployment.find()
      .sort({ timestamp: -1 })
      .limit(50);
    res.json({ success: true, data: deployments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/alerts — get all alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const { resolved, agentId } = req.query;
    const query = {};
    if (resolved !== undefined) query.resolved = resolved === 'true';
    if (agentId) query.agentId = agentId;
    const alerts = await Alert.find(query).sort({ timestamp: -1 }).limit(100);
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/alerts/:id/resolve — resolve an alert
app.patch('/api/alerts/:id/resolve', async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { resolved: true, resolvedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── MongoDB Connection ───────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 InfraWatch Backend running on port ${PORT}`);
      console.log(`📊 Metrics endpoint: http://localhost:${PORT}/metrics`);
      console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });