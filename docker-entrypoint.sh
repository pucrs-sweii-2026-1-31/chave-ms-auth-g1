#!/bin/sh
set -e

npx prisma migrate deploy
npm run seed
node dist/main.js
