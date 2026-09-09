const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const migrationsDir = path.join(root, 'supabase', 'migrations')
const migrations = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'))
  .join('\n')

const hardening = fs.readFileSync(
  path.join(migrationsDir, '0014_production_hardening.sql'),
  'utf8',
)

test('every public application table has RLS enabled by the migration chain', () => {
  const tables = [...migrations.matchAll(/create table(?: if not exists)?\s+(?:public\.)?(\w+)/gi)]
    .map((match) => match[1])

  assert.ok(tables.length > 0)
  for (const table of tables) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(
      migrations,
      new RegExp(`alter table\\s+(?:public\\.)?${escaped}\\s+enable row level security`, 'i'),
      `RLS is not enabled for ${table}`,
    )
  }
})

test('the Data API starts closed and exposes no tables to anon', () => {
  assert.match(
    hardening,
    /revoke all privileges on all tables in schema public from anon, authenticated/i,
  )
  assert.doesNotMatch(hardening, /grant\s+(?:[^;]+)\s+on table[^;]+\s+to anon\b/i)
})

test('every RPC called by the client is explicitly granted to authenticated', () => {
  const srcDir = path.join(root, 'src')
  const files = []
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(fullPath)
    }
  }
  walk(srcDir)

  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  const rpcNames = new Set([...source.matchAll(/\.rpc\(['"]([^'"]+)['"]/g)].map((match) => match[1]))

  assert.ok(rpcNames.size > 0)
  for (const rpcName of rpcNames) {
    assert.match(
      hardening,
      new RegExp(`public\\.${rpcName}\\([^)]*\\)`, 'i'),
      `Missing authenticated function grant for ${rpcName}`,
    )
  }
})

test('internal enrollment sweep is not exposed as a client RPC', () => {
  assert.match(hardening, /revoke all privileges on all functions in schema public from public, anon, authenticated/i)

  const authenticatedGrant = hardening.match(
    /grant execute on function([\s\S]*?)to authenticated;/i,
  )
  assert.ok(authenticatedGrant)
  assert.doesNotMatch(authenticatedGrant[1], /sweep_pending_enrollments/i)
})

test('ledger writes are never granted directly to the client', () => {
  const writeGrants = [...hardening.matchAll(/grant\s+(?:insert|update|delete)[\s\S]*?to authenticated;/gi)]
    .map((match) => match[0])
    .join('\n')

  assert.doesNotMatch(writeGrants, /\bpoint_events\b/i)
})

test('every SECURITY DEFINER function has a pinned search path', () => {
  const functionDefinitions = [...migrations.matchAll(
    /create(?: or replace)? function\s+(\w+)\s*\([\s\S]*?\)\s*([\s\S]*?)\bas\s+\$\$/gi,
  )]
  const definerNames = new Set(functionDefinitions
    .filter((match) => /security definer/i.test(match[2]))
    .map((match) => match[1]))

  assert.ok(definerNames.size > 0)
  for (const functionName of definerNames) {
    assert.match(
      hardening,
      new RegExp(`alter function\\s+public\\.${functionName}\\(`, 'i'),
      `Missing pinned search_path for ${functionName}`,
    )
  }
})

test('frontend configuration uses a publishable key and never a secret key', () => {
  const client = fs.readFileSync(path.join(root, 'src', 'lib', 'supabaseClient.js'), 'utf8')
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8')

  assert.match(client, /VITE_SUPABASE_PUBLISHABLE_KEY/)
  assert.match(example, /^VITE_SUPABASE_PUBLISHABLE_KEY=/m)
  assert.doesNotMatch(`${client}\n${example}`, /service[_-]?role|sb_secret_/i)
})
