#!/usr/bin/env node

/**
 * Script para enviar atualizações do projeto para o repositório GitHub do cliente
 * 
 * Uso:
 *   node scripts/push-to-client-github.mjs <github-token> <github-owner> <github-repo> [branch]
 * 
 * Exemplo:
 *   node scripts/push-to-client-github.mjs ghp_xxxxx cliente-username jumera-sport main
 * 
 * Variáveis de ambiente (alternativa):
 *   CLIENT_GITHUB_TOKEN - Token do GitHub do cliente
 *   CLIENT_GITHUB_OWNER - Owner/organização do repositório
 *   CLIENT_GITHUB_REPO - Nome do repositório
 *   CLIENT_GITHUB_BRANCH - Branch (padrão: main)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);

// Obter credenciais de argumentos ou variáveis de ambiente
const token = args[0] || process.env.CLIENT_GITHUB_TOKEN;
const owner = args[1] || process.env.CLIENT_GITHUB_OWNER;
const repo = args[2] || process.env.CLIENT_GITHUB_REPO;
const branch = args[3] || process.env.CLIENT_GITHUB_BRANCH || 'main';

if (!token || !owner || !repo) {
  console.error('❌ Erro: Credenciais do GitHub do cliente não fornecidas');
  console.error('\nUso:');
  console.error('  node scripts/push-to-client-github.mjs <token> <owner> <repo> [branch]');
  console.error('\nOu defina as variáveis de ambiente:');
  console.error('  CLIENT_GITHUB_TOKEN');
  console.error('  CLIENT_GITHUB_OWNER');
  console.error('  CLIENT_GITHUB_REPO');
  console.error('  CLIENT_GITHUB_BRANCH (opcional, padrão: main)');
  process.exit(1);
}

const remoteUrl = `https://${token}@github.com/${owner}/${repo}.git`;
const remoteNameClient = 'client-github';

console.log('🚀 Iniciando push para repositório do cliente...');
console.log(`📦 Repositório: ${owner}/${repo}`);
console.log(`🌿 Branch: ${branch}`);

try {
  // Verificar se remote já existe
  try {
    execSync(`git remote get-url ${remoteNameClient}`, { stdio: 'ignore' });
    console.log(`✅ Remote '${remoteNameClient}' já existe, atualizando URL...`);
    execSync(`git remote set-url ${remoteNameClient} ${remoteUrl}`);
  } catch {
    console.log(`➕ Adicionando novo remote '${remoteNameClient}'...`);
    execSync(`git remote add ${remoteNameClient} ${remoteUrl}`);
  }

  // Fazer fetch para sincronizar
  console.log('🔄 Sincronizando com repositório remoto...');
  execSync(`git fetch ${remoteNameClient}`, { stdio: 'inherit' });

  // Fazer push
  console.log(`📤 Enviando commits para ${owner}/${repo}:${branch}...`);
  execSync(`git push ${remoteNameClient} HEAD:${branch}`, { stdio: 'inherit' });

  console.log('\n✅ Push concluído com sucesso!');
  console.log(`📍 Repositório: https://github.com/${owner}/${repo}`);
  console.log(`🌿 Branch: ${branch}`);

  // Remover remote após o push (opcional, para segurança)
  console.log('\n🔐 Removendo remote temporário por segurança...');
  execSync(`git remote remove ${remoteNameClient}`);
  console.log('✅ Remote removido');

} catch (error) {
  console.error('\n❌ Erro ao fazer push:');
  console.error(error.message);
  process.exit(1);
}
