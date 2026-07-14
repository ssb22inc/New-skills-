import { auditLogger } from './audit';

export type IncidentSeverity = 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentStatus = 'detected' | 'investigating' | 'contained' | 'eradicated' | 'recovered' | 'closed';

export interface SecurityIncident {
  id: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  detectedAt: string;
  affectedSystems: string[];
  affectedUsers?: string[];
  timeline: IncidentEvent[];
  rootCause?: string;
  remediation?: string;
}

export interface IncidentEvent {
  timestamp: string;
  action: string;
  actor: string;
  details?: string;
}

class IncidentResponseManager {
  private activeIncidents: Map<string, SecurityIncident> = new Map();

  async createIncident(
    severity: IncidentSeverity,
    title: string,
    description: string,
    affectedSystems: string[]
  ): Promise<SecurityIncident> {
    const incident: SecurityIncident = {
      id: `INC-${Date.now()}`,
      severity,
      status: 'detected',
      title,
      description,
      detectedAt: new Date().toISOString(),
      affectedSystems,
      timeline: [
        {
          timestamp: new Date().toISOString(),
          action: 'Incident detected',
          actor: 'system',
        },
      ],
    };

    this.activeIncidents.set(incident.id, incident);

    // Notify based on severity
    await this.notifyStakeholders(incident);

    // Auto-trigger containment for P1
    if (severity === 'P1') {
      await this.triggerAutoContainment(incident);
    }

    // Log to audit
    await auditLogger.log({
      action: 'admin.action',
      user_id: null,
      ip_address: null,
      user_agent: null,
      severity: 'critical',
      success: true,
      details: { incidentId: incident.id, title, type: 'incident_created' },
    });

    return incident;
  }

  async updateIncidentStatus(
    incidentId: string,
    status: IncidentStatus,
    details: string,
    actor: string
  ): Promise<void> {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) throw new Error('Incident not found');

    incident.status = status;
    incident.timeline.push({
      timestamp: new Date().toISOString(),
      action: `Status changed to ${status}`,
      actor,
      details,
    });

    if (status === 'closed') {
      this.activeIncidents.delete(incidentId);
      // Archive incident
    }
  }

  async triggerAutoContainment(incident: SecurityIncident): Promise<void> {
    const containmentActions: string[] = [];

    // System-specific containment
    for (const system of incident.affectedSystems) {
      switch (system) {
        case 'authentication':
          // Force re-authentication for all users
          containmentActions.push('Invalidating all sessions');
          break;

        case 'api':
          // Enable strict rate limiting
          containmentActions.push('Enabling emergency rate limits');
          break;

        case 'database':
          // Enable read-only mode
          containmentActions.push('Switching to read-only mode');
          break;

        case 'payments':
          // Pause payment processing
          containmentActions.push('Pausing payment processing');
          break;
      }
    }

    incident.timeline.push({
      timestamp: new Date().toISOString(),
      action: 'Auto-containment triggered',
      actor: 'system',
      details: containmentActions.join(', '),
    });
  }

  private async notifyStakeholders(incident: SecurityIncident): Promise<void> {
    const stakeholders = {
      P1: ['security-team', 'engineering-leads', 'executives', 'on-call'],
      P2: ['security-team', 'engineering-leads', 'on-call'],
      P3: ['security-team', 'on-call'],
      P4: ['security-team'],
    };

    const groups = stakeholders[incident.severity];

    // Send notifications
    for (const group of groups) {
      await this.sendNotification(group, incident);
    }
  }

  private async sendNotification(group: string, incident: SecurityIncident): Promise<void> {
    // Implementation depends on notification channels
    console.log(`[INCIDENT] Notifying ${group} about ${incident.id}: ${incident.title}`);

    // Slack
    if (process.env.SLACK_INCIDENT_WEBHOOK) {
      const emoji = {
        P1: '🚨',
        P2: '⚠️',
        P3: '📋',
        P4: 'ℹ️',
      };

      await fetch(process.env.SLACK_INCIDENT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${emoji[incident.severity]} *[${incident.severity}] Security Incident*: ${incident.title}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${incident.id}*\n${incident.description}`,
              },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Severity:* ${incident.severity}` },
                { type: 'mrkdwn', text: `*Status:* ${incident.status}` },
                { type: 'mrkdwn', text: `*Systems:* ${incident.affectedSystems.join(', ')}` },
              ],
            },
          ],
        }),
      });
    }
  }

  getActiveIncidents(): SecurityIncident[] {
    return Array.from(this.activeIncidents.values());
  }

  getIncident(id: string): SecurityIncident | undefined {
    return this.activeIncidents.get(id);
  }
}

export const incidentManager = new IncidentResponseManager();

// Runbook templates
export const incidentRunbooks: Record<string, string[]> = {
  data_breach: [
    '1. Contain: Isolate affected systems',
    '2. Assess: Determine scope of breach',
    '3. Notify: Inform legal and compliance teams',
    '4. Preserve: Secure evidence for investigation',
    '5. Remediate: Patch vulnerability',
    '6. Notify: Inform affected users within 72 hours (GDPR)',
    '7. Report: File with relevant authorities',
    '8. Review: Post-incident analysis',
  ],
  ddos_attack: [
    '1. Identify: Confirm DDoS attack pattern',
    '2. Activate: Enable DDoS mitigation (Cloudflare/AWS Shield)',
    '3. Scale: Increase infrastructure capacity',
    '4. Block: Implement IP blocking for attack sources',
    '5. Monitor: Track attack progression',
    '6. Communicate: Update status page',
    '7. Recover: Gradually restore normal operations',
    '8. Analyze: Review attack patterns',
  ],
  credential_compromise: [
    '1. Confirm: Verify compromise',
    '2. Revoke: Invalidate compromised credentials',
    '3. Rotate: Generate new credentials',
    '4. Audit: Review access logs',
    '5. Notify: Alert affected users',
    '6. Scan: Check for unauthorized changes',
    '7. Strengthen: Implement additional controls',
    '8. Document: Record incident details',
  ],
};
