# Testing with preinstall hook

This demonstrates how to set up automatic generation.

## Setup

1. Add to workspace root package.json:

```json
{
  "name": "my-monorepo",
  "private": true,
  "scripts": {
    "preinstall": "pnpm-dep-grouper generate"
  },
  "devDependencies": {
    "pnpm-dep-grouper": "^0.1.0"
  }
}
```

2. Now every time someone runs `pnpm install`, it will:
   - Run preinstall hook
   - Execute `pnpm-dep-grouper generate`
   - Sync dependencies bidirectionally
   - Continue with normal install

## Benefits

- New team members just run `pnpm install` and everything is set up
- CI/CD pipelines work without extra steps
- No manual generate command needed
- Dependencies stay in sync automatically

## Caveat

If `pnpm-dep-grouper` is not installed yet (fresh clone), the preinstall will fail. 

**Solution**: Install it first:
```bash
pnpm add -Dw pnpm-dep-grouper
```

Or use a safer pattern:
```json
{
  "scripts": {
    "preinstall": "command -v pnpm-dep-grouper > /dev/null && pnpm-dep-grouper generate || echo 'Skipping generate'"
  }
}
```
