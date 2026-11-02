const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

const Status = { Active: 0, Succeeded: 1, Claimed: 2, Failed: 3 };
const DURATION = 7 * 24 * 60 * 60;
const GOAL = ethers.utils.parseEther("5");
const eth = (v) => ethers.utils.parseEther(String(v));

describe("CampaignHub", function () {
  // Deploys the hub and opens campaign #0 (goal 5 ETH, one week).
  async function deployFixture() {
    const [creator, alice, bob, stranger] = await ethers.getSigners();

    const Hub = await ethers.getContractFactory("CampaignHub");
    const hub = await Hub.deploy();

    await hub.connect(creator).createCampaign("Solar lamps", GOAL, DURATION);
    const { deadline } = await hub.getCampaign(0);

    return { hub, creator, alice, bob, stranger, deadline };
  }

  describe("createCampaign", function () {
    it("stores the campaign details", async function () {
      const { hub, creator, deadline } = await loadFixture(deployFixture);
      const c = await hub.getCampaign(0);

      expect(c.creator).to.equal(creator.address);
      expect(c.title).to.equal("Solar lamps");
      expect(c.goal).to.equal(GOAL);
      expect(c.raised).to.equal(0);
      expect(c.claimed).to.equal(false);
      expect(c.deadline).to.equal(deadline);
      expect(await hub.campaignCount()).to.equal(1);
    });

    it("assigns sequential ids", async function () {
      const { hub, alice } = await loadFixture(deployFixture);

      await hub.connect(alice).createCampaign("Second", 1, 60);
      expect((await hub.getCampaign(1)).creator).to.equal(alice.address);
      expect(await hub.campaignCount()).to.equal(2);
    });

    it("emits CampaignCreated", async function () {
      const { hub, alice } = await loadFixture(deployFixture);

      await expect(hub.connect(alice).createCampaign("Second", 10, 60))
        .to.emit(hub, "CampaignCreated")
        .withArgs(1, alice.address, "Second", 10, anyValue);
    });

    it("rejects an empty title", async function () {
      const { hub } = await loadFixture(deployFixture);
      await expect(hub.createCampaign("", 1, 60)).to.be.revertedWith("Title required");
    });

    it("rejects a zero goal", async function () {
      const { hub } = await loadFixture(deployFixture);
      await expect(hub.createCampaign("x", 0, 60)).to.be.revertedWith("Goal must be positive");
    });

    it("rejects a zero duration", async function () {
      const { hub } = await loadFixture(deployFixture);
      await expect(hub.createCampaign("x", 1, 0)).to.be.revertedWith("Duration must be positive");
    });
  });

  describe("pledge", function () {
    it("moves ETH into the contract and records it", async function () {
      const { hub, alice } = await loadFixture(deployFixture);
      const amount = eth(2);

      await expect(hub.connect(alice).pledge(0, { value: amount })).to.changeEtherBalances(
        [alice, hub],
        [amount.mul(-1), amount]
      );
      expect(await hub.pledgeOf(0, alice.address)).to.equal(amount);
      expect((await hub.getCampaign(0)).raised).to.equal(amount);
    });

    it("accumulates repeated and multiple backers' pledges", async function () {
      const { hub, alice, bob } = await loadFixture(deployFixture);

      await hub.connect(alice).pledge(0, { value: eth(1) });
      await hub.connect(alice).pledge(0, { value: eth(1) });
      await hub.connect(bob).pledge(0, { value: eth(0.5) });

      expect(await hub.pledgeOf(0, alice.address)).to.equal(eth(2));
      expect(await hub.pledgeOf(0, bob.address)).to.equal(eth(0.5));
      expect((await hub.getCampaign(0)).raised).to.equal(eth(2.5));
    });

    it("emits Pledged", async function () {
      const { hub, alice } = await loadFixture(deployFixture);

      await expect(hub.connect(alice).pledge(0, { value: 123 }))
        .to.emit(hub, "Pledged")
        .withArgs(0, alice.address, 123);
    });

    it("rejects a zero-value pledge", async function () {
      const { hub, alice } = await loadFixture(deployFixture);
      await expect(hub.connect(alice).pledge(0, { value: 0 })).to.be.revertedWith(
        "Pledge must be positive"
      );
    });

    it("rejects pledges after the deadline", async function () {
      const { hub, alice, deadline } = await loadFixture(deployFixture);
      await time.increaseTo(deadline);

      await expect(hub.connect(alice).pledge(0, { value: 1 })).to.be.revertedWith(
        "Campaign has ended"
      );
    });

    it("rejects an unknown campaign", async function () {
      const { hub, alice } = await loadFixture(deployFixture);
      await expect(hub.connect(alice).pledge(99, { value: 1 })).to.be.revertedWith(
        "Campaign does not exist"
      );
    });
  });

  describe("claimFunds", function () {
    async function fundedFixture() {
      const base = await deployFixture();
      await base.hub.connect(base.alice).pledge(0, { value: eth(3) });
      await base.hub.connect(base.bob).pledge(0, { value: eth(2) }); // exactly the goal
      return base;
    }

    it("is blocked while the campaign is running", async function () {
      const { hub, creator } = await loadFixture(fundedFixture);
      await expect(hub.connect(creator).claimFunds(0)).to.be.revertedWith(
        "Campaign still active"
      );
    });

    it("is blocked for anyone but the creator", async function () {
      const { hub, stranger, deadline } = await loadFixture(fundedFixture);
      await time.increaseTo(deadline);

      await expect(hub.connect(stranger).claimFunds(0)).to.be.revertedWith(
        "Only the creator can claim"
      );
    });

    it("is blocked when the goal was missed", async function () {
      const { hub, creator, alice, deadline } = await loadFixture(deployFixture);
      await hub.connect(alice).pledge(0, { value: eth(1) });
      await time.increaseTo(deadline);

      await expect(hub.connect(creator).claimFunds(0)).to.be.revertedWith("Goal not reached");
    });

    it("pays the creator the full amount raised", async function () {
      const { hub, creator, deadline } = await loadFixture(fundedFixture);
      await time.increaseTo(deadline);

      await expect(hub.connect(creator).claimFunds(0)).to.changeEtherBalances(
        [creator, hub],
        [GOAL, GOAL.mul(-1)]
      );
    });

    it("emits FundsClaimed", async function () {
      const { hub, creator, deadline } = await loadFixture(fundedFixture);
      await time.increaseTo(deadline);

      await expect(hub.connect(creator).claimFunds(0))
        .to.emit(hub, "FundsClaimed")
        .withArgs(0, creator.address, GOAL);
    });

    it("cannot be claimed twice", async function () {
      const { hub, creator, deadline } = await loadFixture(fundedFixture);
      await time.increaseTo(deadline);
      await hub.connect(creator).claimFunds(0);

      await expect(hub.connect(creator).claimFunds(0)).to.be.revertedWith("Already claimed");
    });

    it("does not allow refunds once the goal was met", async function () {
      const { hub, alice, deadline } = await loadFixture(fundedFixture);
      await time.increaseTo(deadline);

      await expect(hub.connect(alice).refund(0)).to.be.revertedWith("Goal was reached");
    });
  });

  describe("refund", function () {
    async function failedFixture() {
      const base = await deployFixture();
      await base.hub.connect(base.alice).pledge(0, { value: eth(1) });
      await base.hub.connect(base.bob).pledge(0, { value: eth(2) }); // 3 of 5 ETH
      return base;
    }

    it("is blocked while the campaign is running", async function () {
      const { hub, alice } = await loadFixture(failedFixture);
      await expect(hub.connect(alice).refund(0)).to.be.revertedWith("Campaign still active");
    });

    it("returns exactly the backer's own pledge", async function () {
      const { hub, alice, bob, deadline } = await loadFixture(failedFixture);
      await time.increaseTo(deadline);

      await expect(hub.connect(alice).refund(0)).to.changeEtherBalances(
        [alice, hub],
        [eth(1), eth(1).mul(-1)]
      );
      expect(await hub.pledgeOf(0, alice.address)).to.equal(0);
      expect(await hub.pledgeOf(0, bob.address)).to.equal(eth(2)); // untouched
    });

    it("emits Refunded", async function () {
      const { hub, bob, deadline } = await loadFixture(failedFixture);
      await time.increaseTo(deadline);

      await expect(hub.connect(bob).refund(0))
        .to.emit(hub, "Refunded")
        .withArgs(0, bob.address, eth(2));
    });

    it("can only be taken once", async function () {
      const { hub, alice, deadline } = await loadFixture(failedFixture);
      await time.increaseTo(deadline);
      await hub.connect(alice).refund(0);

      await expect(hub.connect(alice).refund(0)).to.be.revertedWith("Nothing to refund");
    });

    it("rejects accounts that never pledged", async function () {
      const { hub, stranger, deadline } = await loadFixture(failedFixture);
      await time.increaseTo(deadline);

      await expect(hub.connect(stranger).refund(0)).to.be.revertedWith("Nothing to refund");
    });

    it("resists re-entrancy from a malicious backer", async function () {
      const { hub, deadline } = await loadFixture(deployFixture);

      const Attacker = await ethers.getContractFactory("RefundAttacker");
      const attacker = await Attacker.deploy(hub.address);
      await attacker.fund(0, { value: eth(1) });
      await time.increaseTo(deadline);

      // The nested refund fails, which makes the outer transfer fail too.
      await expect(attacker.attack(0)).to.be.revertedWith("Transfer failed");
      expect(await hub.pledgeOf(0, attacker.address)).to.equal(eth(1));
      expect(await ethers.provider.getBalance(hub.address)).to.equal(eth(1));
    });
  });

  describe("statusOf", function () {
    it("walks Active -> Succeeded -> Claimed", async function () {
      const { hub, creator, alice, deadline } = await loadFixture(deployFixture);
      await hub.connect(alice).pledge(0, { value: GOAL });
      expect(await hub.statusOf(0)).to.equal(Status.Active);

      await time.increaseTo(deadline);
      expect(await hub.statusOf(0)).to.equal(Status.Succeeded);

      await hub.connect(creator).claimFunds(0);
      expect(await hub.statusOf(0)).to.equal(Status.Claimed);
    });

    it("walks Active -> Failed", async function () {
      const { hub, alice, deadline } = await loadFixture(deployFixture);
      await hub.connect(alice).pledge(0, { value: 1 });
      expect(await hub.statusOf(0)).to.equal(Status.Active);

      await time.increaseTo(deadline);
      expect(await hub.statusOf(0)).to.equal(Status.Failed);
    });

    it("rejects an unknown campaign", async function () {
      const { hub } = await loadFixture(deployFixture);
      await expect(hub.statusOf(5)).to.be.revertedWith("Campaign does not exist");
    });
  });
});
