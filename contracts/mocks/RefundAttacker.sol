pragma solidity ^0.8.9;

import "../CampaignHub.sol";

/// @dev Test helper. Tries to re-enter `refund` from its receive hook.
contract RefundAttacker {
    CampaignHub public immutable hub;
    uint256 private _target;

    constructor(CampaignHub _hub) {
        hub = _hub;
    }

    function fund(uint256 id) external payable {
        hub.pledge{value: msg.value}(id);
    }

    function attack(uint256 id) external {
        _target = id;
        hub.refund(id);
    }

    receive() external payable {
        hub.refund(_target); // second entry, must fail
    }
}
