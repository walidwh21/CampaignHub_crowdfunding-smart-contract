const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with account ${deployer.address}`);

  const Hub = await hre.ethers.getContractFactory("CampaignHub");
  const hub = await Hub.deploy();
  await hub.deployed();

  console.log(`CampaignHub deployed to ${hub.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
