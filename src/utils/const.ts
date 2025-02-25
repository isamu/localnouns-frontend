import { ref, computed } from "vue";
import { useStore } from "vuex";
import { ethers } from "ethers";
import { addresses } from "@/utils/addresses";
import { svgImageFromSvgPart } from "@/models/point";

interface Token {
  tokenId: number;
  image: string;
}

type Provider =
  | ethers.JsonRpcProvider
  | ethers.AlchemyProvider
  | ethers.InfuraProvider;
type ProviderOrSigner = ethers.Provider | ethers.Signer | undefined;

export const getAddresses = (network: string, contentAddress: string) => {
  const EtherscanBase = (() => {
    if (network == "rinkeby") {
      return "https://rinkeby.etherscan.io/address";
    } else if (network == "goerli") {
      return "https://goerli.etherscan.io/address";
    } else if (network == "mumbai") {
      return "https://mumbai.polygonscan.com/address";
    }
    return "https://etherscan.io/address";
  })();
  const OpenSeaBase = (() => {
    if (network == "rinkeby") {
      return "https://testnets.opensea.io/assets/rinkeby";
    } else if (network == "goerli") {
      return "https://testnets.opensea.io/assets/goerli";
    } else if (network == "mumbai") {
      return "https://testnets.opensea.io/assets/mumbai";
    }
    return "https://opensea.io/assets/ethereum";
  })();
  const EtherscanToken = `${EtherscanBase}/${contentAddress}`;
  const OpenSeaPath = `${OpenSeaBase}/${contentAddress}`;

  return {
    EtherscanBase,
    OpenSeaBase,
    EtherscanToken,
    OpenSeaPath,
  };
};
export const getProvider = (
  network: string,
  alchemyKey: string | undefined,
) => {
  let networkName = network;
  if (network == "mumbai") {
    networkName = "maticmum";
  }
  return networkName == "localhost"
    ? new ethers.JsonRpcProvider()
    : alchemyKey
    ? new ethers.AlchemyProvider(networkName, alchemyKey)
    : new ethers.InfuraProvider(networkName);
};

const decodeTokenData = (tokenURI: string) => {
  const data = tokenURI.substring(29); // HACK: hardcoded
  const decoded = Buffer.from(data, "base64");
  const json = JSON.parse(decoded.toString());
  const svgData = json.image.substring(26); // hardcoded
  const svg = Buffer.from(svgData, "base64").toString();

  return { json, svg };
};

const ISVGHelper = {
  wabi: require("@/abis/ISVGHelper.json"), // wrapped abi
};
const ITokenGate = {
  wabi: require("@/abis/ITokenGate.json"), // wrapped abi
};
const ProviderTokenEx = {
  wabi: require("@/abis/ProviderToken.json"), // wrapped abi
};
// const LocalNounsToken = {
//   wabi: require("@/abis/LocalNounsToken.json"), // wrapped abi
// };
const IAssetProvider = {
  wabi: require("@/abis/IAssetProvider.json"), // wrapped abi
};

export const getSvgHelper = (network: string, provider: ProviderOrSigner) => {
  const svgHelperAddress = addresses["svgHelper"][network];
  const svgHelper = new ethers.Contract(
    svgHelperAddress,
    ISVGHelper.wabi.abi,
    provider,
  );
  return svgHelper;
};

const getTokenGate = (address: string, provider: ProviderOrSigner) => {
  const tokenGate = new ethers.Contract(address, ITokenGate.wabi.abi, provider);
  return tokenGate;
};

export const getAssetProvider = (
  assetProviderName: string,
  network: string,
  provider: ProviderOrSigner,
) => {
  const providerAddress = addresses[assetProviderName][network];
  const assetProvider = new ethers.Contract(
    providerAddress,
    IAssetProvider.wabi.abi,
    provider,
  );
  return assetProvider;
};

export const getTokenContract = (
  address: string,
  provider: ProviderOrSigner,
): ethers.Contract => {
  const tokenContract = new ethers.Contract(
    address,
    ProviderTokenEx.wabi.abi,
    provider,
  );
  return tokenContract;
};

// Token Contract functions
const getBalanceFromTokenContract = async (
  tokenContract: ethers.Contract,
  account: string,
) => {
  const [balance] = await tokenContract.balanceOf(account);
  return balance;
};
const getMintPriceForFromTokenContract = async (
  tokenContract: ethers.Contract,
  account: string,
) => {
  const [value] = await tokenContract.mintPriceFor(account);
  return value;
};
const getTotalSupplyFromTokenContract = async (
  tokenContract: ethers.Contract,
) => {
  const supply = await tokenContract.totalSupply();
  return Number(supply);
};

const getMintLimitFromTokenContract = async (
  tokenContract: ethers.Contract,
) => {
  const limit = await tokenContract.mintLimit();
  return Number(limit);
};
const getDebugTokenURI = async (
  tokenContract: ethers.Contract,
  tokenId: number,
) => {
  const [tokenURI, gas] = await tokenContract.debugTokenURI(tokenId);
  return { tokenURI, gas: Number(gas) };
};

export const useFetchTokens = (
  network: string,
  assetProvider: string | undefined,
  provider: Provider,
  contractRO: ethers.Contract,
) => {
  const totalSupply = ref<number>(0);
  const mintLimit = ref<number>(0);
  const nextImage = ref<string | null>(null);
  const tokens = ref<Token[]>([]);

  const fetchTokens = async () => {
    const svgHelper = getSvgHelper(network, provider);
    totalSupply.value = await getTotalSupplyFromTokenContract(contractRO);
    mintLimit.value = await getMintLimitFromTokenContract(contractRO);

    const providerAddress = addresses[assetProvider || "dotNouns"][network];

    console.log("totalSupply/mintLimit", totalSupply.value, mintLimit.value);
    if (totalSupply.value < mintLimit.value) {
      const [svgPart, tag, gas] = await svgHelper.generateSVGPart(
        providerAddress,
        totalSupply.value,
      );
      console.log("gas:", gas);
      nextImage.value = svgImageFromSvgPart(svgPart, tag, "");
    } else {
      nextImage.value = null;
    }
    tokens.value = [];
    for (
      let tokenId = Math.max(0, totalSupply.value - 4);
      tokenId < totalSupply.value;
      tokenId++
    ) {
      const { tokenURI, gas } = await getDebugTokenURI(contractRO, tokenId);
      console.log("gas", tokenId, gas);
      const { json } = decodeTokenData(tokenURI);
      tokens.value.push({ tokenId, image: json.image });
    }
  };
  return {
    totalSupply,
    mintLimit,
    nextImage,
    tokens,

    fetchTokens,
  };
};

export const useCheckTokenGate = (
  tokenGateAddress: string,
  tokenGated: boolean,
  provider: Provider,
  contractRO: ethers.Contract,
) => {
  const totalBalance = ref<number>(0);
  const balanceOf = ref<number>(0);
  const mintPrice = ref<bigint>(BigInt(0));

  const checkTokenGate = async (account: string) => {
    console.log("### calling totalBalanceOf");
    if (tokenGated) {
      const tokenGate = getTokenGate(tokenGateAddress, provider);
      const [result] = await tokenGate.balanceOf(account);
      totalBalance.value = result.toNumber();
    }
    balanceOf.value = await getBalanceFromTokenContract(contractRO, account);
    mintPrice.value = await getMintPriceForFromTokenContract(
      contractRO,
      account,
    );
  };
  return {
    totalBalance,
    balanceOf,
    mintPrice,

    checkTokenGate,
  };
};

export const _useNetworkContext = (
  chainId: string,
  tokenAddress: string,
  func: (address: string, provider: ProviderOrSigner) => ethers.Contract,
) => {
  const store = useStore();

  const networkContext = computed(() => {
    const signer = store.getters.getSigner(chainId);
    console.log(signer, chainId);
    if (signer) {
      const contract = func(tokenAddress, signer);
      return { signer, contract };
    }
    return null;
  });

  return {
    networkContext,
  };
};

export const useTokenNetworkContext = (
  chainId: string,
  tokenAddress: string,
) => {
  return _useNetworkContext(chainId, tokenAddress, getTokenContract);
};
