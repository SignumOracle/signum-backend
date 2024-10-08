const { ethers } = require("ethers");
const { BigNumber } = require('ethers');
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const web3 = require("web3");

// Replace with your own Infura or Alchemy API URL or a local Ethereum node
const provider = new ethers.providers.JsonRpcProvider(
  "https://rpc.pulsechain.com"
);

// Load the ABI JSON file
const flexABI = JSON.parse(fs.readFileSync("abi/SignumFlexABI.json", "utf8"));
const autopayABI = JSON.parse(fs.readFileSync("abi/AutopayABI.json", "utf8"));

// Replace with your contract's address
const flexContractAddress = "0x25baEbFAc231836bd5AFd1F211f6E8306f2BCC1e";
const autopayContractAddress = "0x5CBcA25A8CD90d7b80Ba40a67E40E4D027738743";

// Initialize the contract
const flexContract = new ethers.Contract(
  flexContractAddress,
  flexABI,
  provider
);

const autopayContract = new ethers.Contract(
  autopayContractAddress,
  autopayABI,
  provider
);

// File path to store event data
const newReportDataFilePath = "./eventData.json";
const tipAddedDataFilePath = "./eventData1.json";

// Function to save event data to file
function saveNewReportEventData(eventData) {
  let data = [];
  if (fs.existsSync(newReportDataFilePath)) {
    const fileContent = fs.readFileSync(newReportDataFilePath);
    data = JSON.parse(fileContent);
  }

  // Check for duplicates
  if (!data.find((e) => e.txnHash === eventData.txnHash)) {
    data.push(eventData);
  }

  if (data.length > 1000) {
    data.splice(0, data.length - 1000);
  }

  fs.writeFileSync(newReportDataFilePath, JSON.stringify(data, null, 2));
  console.log("NewReport event data saved to JSON file");
}

function saveTipAddedEventData(eventData) {
  let data = [];
  if (fs.existsSync(tipAddedDataFilePath)) {
    const fileContent = fs.readFileSync(tipAddedDataFilePath);
    data = JSON.parse(fileContent);
  }

  // Check for duplicates
  if (!data.find((e) => e.txnHash === eventData.txnHash)) {
    data.push(eventData);
  }

  if (data.length > 1000) {
    data.splice(0, data.length - 1000);
  }

  fs.writeFileSync(tipAddedDataFilePath, JSON.stringify(data, null, 2));
  console.log("TipAdded event data saved to JSON file");
}

// Function to fetch historical events
async function fetchHistoricalEvents(fromBlock, toBlock) {
  console.log(
    `Fetching historical events from block ${fromBlock} to ${toBlock}...`
  );
  const events = await flexContract.queryFilter(
    "NewReport",
    fromBlock,
    toBlock
  );

  events.forEach((event) => {
    const eventData = {
      id: event.transactionHash,
      _queryId: event.args._queryId,
      _time: Number(event.args._time),
      _value: event.args._value,
      _blockNumber: event.blockNumber,
      _nonce: Number(event.args._nonce),
      _queryData: event.args._queryData,
      _reporter: event.args._reporter,
      txnHash: event.transactionHash,
      __typename: "NewReportEntity",
    };

    saveNewReportEventData(eventData);
  });

  const tipEvents = await autopayContract.queryFilter(
    "TipAdded",
    fromBlock,
    toBlock
  );

  tipEvents.forEach((event) => {
const amountBigNumber = BigNumber.from(event.args._amount);
    const eventData = {
      id: event.transactionHash,
      _queryId: event.args._queryId,
      _amount: amountBigNumber.toString(),
      _queryData: event.args._queryData,
      _tipper: event.args._tipper,
      _startTime: Math.floor(Date.now() / 1000),
      txnHash: event.transactionHash,
      __typename: "TipAddedEntity",
    };

    saveTipAddedEventData(eventData);
  });
}

// Fetch historical events (adjust the block range as needed)
const startBlock = 21238759; // Replace with the block number you want to start from
const endBlock = "latest"; // You can replace 'latest' with a specific block number if needed
fetchHistoricalEvents(startBlock, endBlock);

// Set up Express server to serve the JSON data
const app = express();

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

app.get("/new-report", (req, res) => {
  if (fs.existsSync(newReportDataFilePath)) {
    const fileContent = fs.readFileSync(newReportDataFilePath);
    res.json(JSON.parse(fileContent));
  } else {
    res.json([]);
  }
});

app.get("/tip-added", (req, res) => {
  if (fs.existsSync(tipAddedDataFilePath)) {
    const fileContent = fs.readFileSync(tipAddedDataFilePath);
    res.json(JSON.parse(fileContent));
  } else {
    res.json([]);
  }
});

app.post("/webhook/tip-added", (req, res) => {
  try {
    const { _queryData, _tipper } = web3.eth.abi.decodeParameters(
      ["bytes _queryData", "address _tipper"],
      req.body.logs[0].data
    );

    const event = {
      id: req.body.logs[0].transactionHash,
      _queryId: req.body.logs[0].topic1,
      _amount: Number(req.body.logs[0].topic2),
      _queryData,
      _tipper,
      _startTime: req.body.block.timestamp,
      txnHash: req.body.logs[0].transactionHash,
      __typename: "TipAddedEntity",
    };

    console.log(event);

    saveTipAddedEventData(event);

    res.json({ event });
  } catch (e) {
    console.log(e);
    res.json({});
  }
});

app.post("/webhook/new-report", (req, res) => {
  try {
    const { _value, _nonce, _queryData } = web3.eth.abi.decodeParameters(
      ["bytes _value", "uint256 _nonce", "bytes _queryData"],
      req.body.logs[0].data
    );

    const _reporter = ethers.utils.isAddress(req.body.logs[0].topic3)
      ? req.body.logs[0].topic3
      : web3.eth.abi.decodeParameter("address", req.body.logs[0].topic3);

    const event = {
      id: req.body.logs[0].transactionHash,
      _queryId: req.body.logs[0].topic1,
      _time: Number(req.body.logs[0].topic2),
      _value,
      _blockNumber: Number(req.body.block.number),
      _nonce: Number(_nonce),
      _queryData,
      _reporter,
      txnHash: req.body.logs[0].transactionHash,
      __typename: "NewReportEntity",
    };

    console.log(event);

    saveNewReportEventData(event);

    res.json({ event });
  } catch (e) {
    console.log(e);
    res.json({});
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
