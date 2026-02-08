#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

import { readConfig, writeConfig } from './config.js';
import { getJson, postJson } from './http.js';

const program = new Command();

program.name('oadm').description('OADM Inbox CLI').version('0.0.1');

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
    await postJson(`${cfg.apiUrl}/v1/register`, { name: opts.name, password: opts.password });
    console.log(chalk.green('✓ registered'));
    console.log('Next: oadm login --name <name> --password <pw>');
  });

program
  .command('login')
  .requiredOption('--name <name>')
  .requiredOption('--password <password>')
  .action(async (opts) => {
    const cfg = readConfig();
    const data = await postJson<{ token: string }>(`${cfg.apiUrl}/v1/login`, { name: opts.name, password: opts.password });
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
    const data = await postJson<{ id: string }>(`${cfg.apiUrl}/v1/messages/send`, { toName: opts.to, text: opts.text }, cfg.token);
    console.log(chalk.green('✓ sent'), data.id);
  });

program
  .command('inbox')
  .option('--unread', 'Only unread', false)
  .option('--json', 'JSON output', false)
  .option('--ack', 'Ack returned messages', false)
  .action(async (opts) => {
    const cfg = readConfig();
    if (!cfg.token) throw new Error('not_logged_in');
    const q = new URLSearchParams();
    if (opts.unread) q.set('unread', '1');
    const data = await getJson<{ messages: any[] }>(`${cfg.apiUrl}/v1/messages/inbox?${q.toString()}`, cfg.token);

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      for (const m of data.messages) {
        console.log(`${m.id}  from:${m.fromName}  ${new Date(m.createdAt).toLocaleString()}`);
        console.log(m.text);
        console.log('---');
      }
      if (!data.messages.length) console.log('(empty)');
    }

    if (opts.ack) {
      for (const m of data.messages) {
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

program.parseAsync(process.argv).catch((e) => {
  console.error(chalk.red('error:'), e?.message ?? String(e));
  process.exit(1);
});
