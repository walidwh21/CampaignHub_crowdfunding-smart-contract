pragma solidity ^0.8.9;

/**
 * @title CampaignHub
 * @notice All-or-nothing crowdfunding. Anyone can open a campaign with a goal
 *         and a deadline. Backers pledge ETH while it is running. Afterwards:
 *           - goal reached  -> the creator withdraws everything raised
 *           - goal missed   -> every backer can take their pledge back
 *         Funds never leave the contract except through those two paths.
 */
contract CampaignHub {
    enum Status {
        Active, // deadline not reached yet
        Succeeded, // deadline passed, goal met, funds not yet withdrawn
        Claimed, // goal met and the creator has withdrawn
        Failed // deadline passed, goal missed, backers may refund
    }

    struct Campaign {
        address payable creator;
        string title;
        uint256 goal;
        uint256 deadline;
        uint256 raised;
        bool claimed;
    }

    uint256 public campaignCount;

    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => mapping(address => uint256)) private _pledges;

    event CampaignCreated(
        uint256 indexed id,
        address indexed creator,
        string title,
        uint256 goal,
        uint256 deadline
    );
    event Pledged(uint256 indexed id, address indexed backer, uint256 amount);
    event FundsClaimed(uint256 indexed id, address indexed creator, uint256 amount);
    event Refunded(uint256 indexed id, address indexed backer, uint256 amount);

    modifier campaignExists(uint256 id) {
        require(id < campaignCount, "Campaign does not exist");
        _;
    }

    // ---------------------------------------------------------------------
    // Write functions
    // ---------------------------------------------------------------------

    /// @param title    Short human readable name.
    /// @param goal     Amount in wei that must be raised for the campaign to succeed.
    /// @param duration Seconds the campaign stays open, counted from this call.
    function createCampaign(
        string calldata title,
        uint256 goal,
        uint256 duration
    ) external returns (uint256 id) {
        require(bytes(title).length > 0, "Title required");
        require(goal > 0, "Goal must be positive");
        require(duration > 0, "Duration must be positive");

        id = campaignCount++;

        Campaign storage c = _campaigns[id];
        c.creator = payable(msg.sender);
        c.title = title;
        c.goal = goal;
        c.deadline = block.timestamp + duration;

        emit CampaignCreated(id, msg.sender, title, goal, c.deadline);
    }

    /// @notice Back a running campaign with the ETH sent along.
    function pledge(uint256 id) external payable campaignExists(id) {
        Campaign storage c = _campaigns[id];
        require(block.timestamp < c.deadline, "Campaign has ended");
        require(msg.value > 0, "Pledge must be positive");

        c.raised += msg.value;
        _pledges[id][msg.sender] += msg.value;

        emit Pledged(id, msg.sender, msg.value);
    }

    /// @notice Creator withdraws the total raised once the goal has been met.
    function claimFunds(uint256 id) external campaignExists(id) {
        Campaign storage c = _campaigns[id];
        require(msg.sender == c.creator, "Only the creator can claim");
        require(block.timestamp >= c.deadline, "Campaign still active");
        require(c.raised >= c.goal, "Goal not reached");
        require(!c.claimed, "Already claimed");

        // effects before interaction
        c.claimed = true;
        uint256 amount = c.raised;

        (bool ok, ) = c.creator.call{value: amount}("");
        require(ok, "Transfer failed");

        emit FundsClaimed(id, msg.sender, amount);
    }

    /// @notice Backer reclaims their pledge from a campaign that missed its goal.
    function refund(uint256 id) external campaignExists(id) {
        Campaign storage c = _campaigns[id];
        require(block.timestamp >= c.deadline, "Campaign still active");
        require(c.raised < c.goal, "Goal was reached");

        uint256 amount = _pledges[id][msg.sender];
        require(amount > 0, "Nothing to refund");

        // effects before interaction
        _pledges[id][msg.sender] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");

        emit Refunded(id, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getCampaign(uint256 id)
        external
        view
        campaignExists(id)
        returns (Campaign memory)
    {
        return _campaigns[id];
    }

    function pledgeOf(uint256 id, address backer)
        external
        view
        campaignExists(id)
        returns (uint256)
    {
        return _pledges[id][backer];
    }

    function statusOf(uint256 id) public view campaignExists(id) returns (Status) {
        Campaign storage c = _campaigns[id];

        if (block.timestamp < c.deadline) return Status.Active;
        if (c.raised < c.goal) return Status.Failed;
        return c.claimed ? Status.Claimed : Status.Succeeded;
    }
}
