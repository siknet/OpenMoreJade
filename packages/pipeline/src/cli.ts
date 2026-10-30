import { runPipeline } from './engine.ts'

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'run'

  if (command === 'run') {
    try {
      await runPipeline()
      process.exit(0)
    } catch (err: any) {
      console.error('Pipeline failed:', err)
      process.exit(1)
    }
  } else {
    console.log(`Unknown command: ${command}. Usage: node src/cli.ts [run]`)
  }
}

main()
