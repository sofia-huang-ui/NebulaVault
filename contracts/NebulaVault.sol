// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {IERC7984} from "confidential-contracts-v91/contracts/interfaces/IERC7984.sol";
import {FHESafeMath} from "confidential-contracts-v91/contracts/utils/FHESafeMath.sol";

/// @title NebulaVault
/// @notice Confidential staking vault that accepts mETH and mUSDT ERC7984 tokens
contract NebulaVault is ZamaEthereumConfig {
    enum Asset {
        METH,
        MUSDT
    }

    IERC7984 public immutable methToken;
    IERC7984 public immutable musdtToken;

    mapping(address => euint64) private _methStakes;
    mapping(address => euint64) private _musdtStakes;

    euint64 private _totalMethStaked;
    euint64 private _totalMusdtStaked;

    event Staked(address indexed user, Asset indexed asset, euint64 amount);
    event Unstaked(address indexed user, Asset indexed asset, euint64 amount);

    error NebulaVaultOperatorMissing();
    error NebulaVaultInvalidToken();

    constructor(address methTokenAddress, address musdtTokenAddress) {
        if (methTokenAddress == address(0) || musdtTokenAddress == address(0)) {
            revert NebulaVaultInvalidToken();
        }

        methToken = IERC7984(methTokenAddress);
        musdtToken = IERC7984(musdtTokenAddress);
    }

    /// @notice Deposits encrypted tokens into the vault
    function stake(Asset asset, externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        IERC7984 token = _getToken(asset);

        if (!token.isOperator(msg.sender, address(this))) {
            revert NebulaVaultOperatorMissing();
        }

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allow(amount, address(token));

        euint64 transferred = token.confidentialTransferFrom(msg.sender, address(this), amount);

        _increaseStake(asset, msg.sender, transferred);
        _increaseTotal(asset, transferred);

        emit Staked(msg.sender, asset, transferred);
    }

    /// @notice Withdraws encrypted tokens from the vault
    function unstake(Asset asset, externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        IERC7984 token = _getToken(asset);

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);

        (ebool canWithdraw, euint64 updatedStake) = _decreaseStake(asset, msg.sender, requested);

        euint64 withdrawAmount = FHE.select(canWithdraw, requested, FHE.asEuint64(0));
        FHE.allow(withdrawAmount, address(token));
        euint64 sent = token.confidentialTransfer(msg.sender, withdrawAmount);

        _updateStakeStorage(asset, msg.sender, updatedStake);
        _decreaseTotal(asset, sent);

        emit Unstaked(msg.sender, asset, sent);
    }

    /// @notice Returns the encrypted staked balance for an account
    function getEncryptedStake(address account, Asset asset) external view returns (euint64) {
        return _getStake(asset, account);
    }

    /// @notice Returns the encrypted total staked balance for an asset
    function getTotalStaked(Asset asset) external view returns (euint64) {
        return asset == Asset.METH ? _totalMethStaked : _totalMusdtStaked;
    }

    function _increaseStake(Asset asset, address account, euint64 amount) private {
        euint64 current = _getStake(asset, account);
        (, euint64 updated) = FHESafeMath.tryIncrease(current, amount);
        _updateStakeStorage(asset, account, updated);
    }

    function _decreaseStake(Asset asset, address account, euint64 amount) private returns (ebool success, euint64 updated) {
        euint64 current = _getStake(asset, account);
        (success, updated) = FHESafeMath.tryDecrease(current, amount);
    }

    function _increaseTotal(Asset asset, euint64 amount) private {
        if (asset == Asset.METH) {
            (, euint64 updated) = FHESafeMath.tryIncrease(_totalMethStaked, amount);
            FHE.allowThis(updated);
            _totalMethStaked = updated;
        } else {
            (, euint64 updated) = FHESafeMath.tryIncrease(_totalMusdtStaked, amount);
            FHE.allowThis(updated);
            _totalMusdtStaked = updated;
        }
    }

    function _decreaseTotal(Asset asset, euint64 amount) private {
        if (asset == Asset.METH) {
            (, euint64 updated) = FHESafeMath.tryDecrease(_totalMethStaked, amount);
            FHE.allowThis(updated);
            _totalMethStaked = updated;
        } else {
            (, euint64 updated) = FHESafeMath.tryDecrease(_totalMusdtStaked, amount);
            FHE.allowThis(updated);
            _totalMusdtStaked = updated;
        }
    }

    function _getStake(Asset asset, address account) private view returns (euint64) {
        return asset == Asset.METH ? _methStakes[account] : _musdtStakes[account];
    }

    function _updateStakeStorage(Asset asset, address account, euint64 value) private {
        FHE.allowThis(value);
        FHE.allow(value, account);

        if (asset == Asset.METH) {
            _methStakes[account] = value;
        } else {
            _musdtStakes[account] = value;
        }
    }

    function _getToken(Asset asset) private view returns (IERC7984) {
        return asset == Asset.METH ? methToken : musdtToken;
    }
}
