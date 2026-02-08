#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import chalk from 'chalk';

import { readConfig, writeConfig } from './config.js';
import { getJson, postJson } from './http.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version?: string };
const program = new Command();

program
  .name('oadm')
  .description('OADM Inbox CLI')
  .version(pkg.version ?? '0.0.0');

program
  .option('--api <url>', 'API base URL (or set OADM_API_URL)', '')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.api) {
      const cfg = readConfig();
      cfg.apiUrl = opts.api;
      writeConfig(cfg);
    }
  });

program
  .command('register')
  .requiredOption('--name <name>')
  .requiredOption('--password <password>')
  .action(async (opts) => {
    const cfg = readConfig();
    await postJson(`${cfg.apiUrl}/v1/register`, {
      name: opts.name,
      password: opts.password,
      inviteCode: process.env.OADM_INVITE_CODE,
    });
    console.log(chalk.green('✓ registered'));
    console.log('Next: oadm login --name <name> --password <pw>');
  });

program
  .command('login')
  .requiredOption('--name <name>')
  .requiredOption('--password <password>')
  .action(async (opts) => {
    const cfg = readConfig();
    const data = await postJson<{ token: string }>(`${cfg.apiUrl}/v1/login`, {
      name: opts.name,
      password: opts.password,
    });
    cfg.name = opts.name;
    cfg.token = data.token;
    writeConfig(cfg);
    console.log(chalk.green('✓ logged in'));
  });

program
  .command('send')
  .requiredOption('--to <recipientName>')
  .requiredOption('--text <text>')
  .action(async (opts) => {
    const cfg = readConfig();
    if (!cfg.token) throw new Error('not_logged_in');
    const data = await postJson<{ id: string }>(
      `${cfg.apiUrl}/v1/messages/send`,
      { toName: opts.to, text: opts.text },
      cfg.token
    );
    console.log(chalk.green('✓ sent'), data.id);
  });

program
  .command('inbox')
  .option('--unread', 'Only unread', false)
  .option('--received', 'Show received messages only (inbox)', false)
  .option('--sent', 'Show sent messages only (outbox)', false)
  .option('--all', 'Show both received and sent (default)', false)
  .option('--since <timestamp>', 'Only messages since timestamp (ISO 8601 or unix)', '')
  .option('--limit <count>', 'Max messages to return (cap 200)', '')
  .option('--json', 'JSON output', false)
  .option('--ack', 'Ack returned messages', false)
  .action(async (opts) => {
    const cfg = readConfig();
    if (!cfg.token) throw new Error('not_logged_in');
    if (opts.sent && opts.all) throw new Error('conflicting_flags_sent_all');
    if (opts.sent && opts.received) throw new Error('conflicting_flags_sent_received');
    if (opts.all && opts.received) throw new Error('conflicting_flags_all_received');
    const q = new URLSearchParams();
    if (opts.unread) q.set('unread', '1');
    if (opts.received) q.set('received', '1');
    if (opts.sent) q.set('sent', '1');
    if (opts.all) q.set('all', '1');
    if (opts.since) q.set('since', opts.since);
    if (opts.limit) q.set('limit', String(opts.limit));
    const data = await getJson<{ messages: any[] }>(`${cfg.apiUrl}/v1/messages/inbox?${q.toString()}`, cfg.token);

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      for (const m of data.messages) {
        const direction = m.direction ?? (opts.sent ? 'out' : 'in');
        const peer = direction === 'out' ? `to:${m.toName}` : `from:${m.fromName}`;
        const ackedAt = m.ackedAt ? `  acked:${new Date(m.ackedAt).toLocaleString()}` : '';
        console.log(`${m.id}  ${peer}  ${new Date(m.createdAt).toLocaleString()}${direction === 'out' ? ackedAt : ''}`);
        console.log(m.text);
        console.log('---');
      }
      if (!data.messages.length) console.log('(empty)');
    }

    if (opts.ack) {
      for (const m of data.messages) {
        if (m.direction === 'out') continue;
        await postJson(`${cfg.apiUrl}/v1/messages/ack/${m.id}`, {}, cfg.token);
      }
    }
  });

program
  .command('ack')
  .argument('<msgId>')
  .action(async (msgId) => {
    const cfg = readConfig();
    if (!cfg.token) throw new Error('not_logged_in');
    await postJson(`${cfg.apiUrl}/v1/messages/ack/${msgId}`, {}, cfg.token);
    console.log(chalk.green('✓ acked'), msgId);
  });

program
  .command('webhook:create')
  .requiredOption('--url <url>')
  .option('--secret <secret>')
  .action(async (opts) => {
    const cfg = readConfig();
    if (!cfg.token) throw new Error('not_logged_in');
    const data = await postJson<{ webhook: any; secret: string }>(
      `${cfg.apiUrl}/v1/webhooks`,
      { url: opts.url, secret: opts.secret },
      cfg.token
    );
    console.log(chalk.green('✓ webhook created'), data.webhook.id);
    console.log('secret:', data.secret);
  });

program
  .command('webhook:list')
  .option('--json', 'JSON output', false)
  .action(async (opts) => {
    const cfg = readConfig();
    if (!cfg.token) throw new Error('not_logged_in');
    const data = await getJson<{ webhooks: any[] }>(`${cfg.apiUrl}/v1/webhooks`, cfg.token);
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    for (const hook of data.webhooks) {
      console.log(`${hook.id}  ${hook.url}  enabled:${hook.enabled}`);
    }
    if (!data.webhooks.length) console.log('(empty)');
  });

program
  .command('webhook:delete')
  .argument('<webhookId>')
  .action(async (webhookId) => {
    const cfg = readConfig();
    if (!cfg.token) throw new Error('not_logged_in');
    await postJson(`${cfg.apiUrl}/v1/webhooks/${webhookId}`, {}, cfg.token, 'DELETE');
    console.log(chalk.green('✓ webhook deleted'), webhookId);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(chalk.red('error:'), e?.message ?? String(e));
  process.exit(1);
});
