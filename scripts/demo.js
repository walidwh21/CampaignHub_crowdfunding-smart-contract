// Walks through both campaign outcomes on the in-process Hardhat network:
//   npm run demo
const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const { ethers } = hre;
const eth = (v) => ethers.utils.parseEther(String(v));
const fmt = (v) => `${ethers.utils.formatEther(v)} ETH`;
const STATUS = ["Active", "Succeeded", "Claimed", "Failed"];
const WEEK = 7 * 24 * 60 * 60;

async function main() {
  const [creator, alice, bob] = await ethers.getSigners();

  const Hub = await ethers.getContractFactory("CampaignHub");
  const hub = await Hub.deploy();
  await hub.deployed();
  console.log(`Hub deployed at ${hub.address}\n`);

  // Campaign 0 will reach its goal, campaign 1 will not.
  await hub.connect(creator).createCampaign("Community garden", eth(3), WEEK);
  await hub.connect(creator).createCampaign("Mobile library", eth(10), WEEK);

  await hub.connect(alice).pledge(0, { value: eth(2) });
  await hub.connect(bob).pledge(0, { value: eth(1.5) });
  await hub.connect(alice).pledge(1, { value: eth(1) });

  for (const id of [0, 1]) {
    const c = await hub.getCampaign(id);
    console.log(
      `#${id} ${c.title}: ${fmt(c.raised)} of ${fmt(c.goal)} [${STATUS[await hub.statusOf(id)]}]`
    );
  }

  console.log("\n...one week later...\n");
  await time.increase(WEEK + 1);

  for (const id of [0, 1]) {
    console.log(`#${id} is now ${STATUS[await hub.statusOf(id)]}`);
  }

  await hub.connect(creator).claimFunds(0);
  console.log(`\nCreator claimed campaign #0 -> ${STATUS[await hub.statusOf(0)]}`);

  await hub.connect(alice).refund(1);
  console.log(`Alice refunded from campaign #1 (pledge now ${fmt(await hub.pledgeOf(1, alice.address))})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
