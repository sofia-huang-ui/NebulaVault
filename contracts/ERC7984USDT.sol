// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "confidential-contracts-v91/contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract ERC7984USDT is ERC7984, ZamaEthereumConfig {
    constructor() ERC7984("mUSDT", "mUSDT", "") {}

    function faucet(address to) public {
        euint64 encryptedAmount = FHE.asEuint64(1000*1000000);
        _mint(to, encryptedAmount);
    }
}
