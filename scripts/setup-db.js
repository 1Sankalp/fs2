// Script to setup database for production
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to run a command and log its output
function runCommand(command) {
  console.log(`Running: ${command}`);
  try {
    const output = execSync(command, { stdio: 'inherit' });
    return output;
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.toString());
    throw error;
  }
}

// Main function
async function main() {
  console.log('Setting up database...');
  
  // Generate Prisma client
  runCommand('npx prisma generate');
  
  // Push the schema to the database
  runCommand('npx prisma db push --accept-data-loss');
  
  console.log('Database setup complete!');
}

// Run the script
main()
  .then(() => {
    console.log('Setup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Setup failed', error);
    process.exit(1);
  }); 