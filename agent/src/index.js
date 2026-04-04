require('dotenv').config();
const si = require('systeminformation');
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const AGENT_ID = process.env.AGENT_ID || require('os').hostname();
const INTERVAL = parseInt(process.env.INTERVAL) || 30000; // 30 seconds

console.log(`🚀 InfraWatch Agent starting...`);
console.log(`📡 Backend: ${BACKEND_URL}`);
console.log(`🖥️  Agent ID: ${AGENT_ID}`);
console.log(`⏱️  Interval: ${INTERVAL}ms`);

async function collectMetrics() {
  try {
    const [cpu, mem, disk, network, load, processes] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.currentLoad(),
      si.processes()
    ]);

    const metrics = {
      agentId: AGENT_ID,
      timestamp: new Date(),
      cpu: {
        usage: parseFloat(cpu.currentLoad.toFixed(2)),
        cores: cpu.cpus.length,
        userLoad: parseFloat(cpu.currentLoadUser.toFixed(2)),
        systemLoad: parseFloat(cpu.currentLoadSystem.toFixed(2))
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usagePercent: parseFloat(((mem.active / mem.total) * 100).toFixed(2))
      },
      disk: disk.map(d => ({
        fs: d.fs,
        size: d.size,
        used: d.used,
        available: d.available,
        usagePercent: parseFloat(d.use.toFixed(2)),
        mount: d.mount
      })),
      network: network.map(n => ({
        interface: n.iface,
        rxBytes: n.rx_bytes,
        txBytes: n.tx_bytes,
        rxSec: n.rx_sec,
        txSec: n.tx_sec
      })),
      processes: {
        total: processes.all,
        running: processes.running,
        blocked: processes.blocked,
        sleeping: processes.sleeping
      }
    };

    const response = await axios.post(`${BACKEND_URL}/api/metrics`, metrics);
    console.log(`✅ [${new Date().toISOString()}] Metrics pushed — CPU: ${metrics.cpu.usage}% | RAM: ${metrics.memory.usagePercent}%`);

  } catch (error) {
    console.error(`❌ Failed to push metrics:`, error.message);
  }
}

// Collect immediately then every INTERVAL
collectMetrics();
setInterval(collectMetrics, INTERVAL);