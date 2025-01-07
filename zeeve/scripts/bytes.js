// Convert a hex string into a Uint8Array (byte array)
function hexToBytes(hex) {
    let bytes = new Uint8Array(Math.ceil(hex.length / 2));  // Each pair of hex characters represent 1 byte
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16); // Convert hex to decimal
    }
    return bytes; // Return the byte array
}

// Convert a Uint8Array (byte array) back to a hex string
function bytesToHex(bytes) {
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join(''); // Convert each byte to hex and concatenate
}

// Concatenate two hex strings (publicKey and proofOfPossession) and return the concatenated hex string
function concatHexStrings(hex1, hex2) {
    let bytes1 = hexToBytes(hex1); // Convert first hex string to bytes
    let bytes2 = hexToBytes(hex2); // Convert second hex string to bytes

    // Create a new Uint8Array to hold the concatenated bytes
    let concatenatedBytes = new Uint8Array(bytes1.length + bytes2.length);

    // Copy the first byte array (bytes1) into the concatenated array
    concatenatedBytes.set(bytes1, 0);

    // Copy the second byte array (bytes2) into the concatenated array after bytes1
    concatenatedBytes.set(bytes2, bytes1.length);

    // Convert concatenated byte array back into a hex string and return it
    return bytesToHex(concatenatedBytes);
}

// Deconcatenate the concatenated hex string into its original publicKey and proofOfPossession parts
function deconcatHexString(concatenatedHex, publicKeyLength) {
    // Split the concatenated hex string into publicKey and proofOfPossession
    let publicKey = concatenatedHex.slice(0, publicKeyLength * 2); // publicKeyLength is in bytes, so multiply by 2 for hex length
    let proofOfPossession = concatenatedHex.slice(publicKeyLength * 2); // Extract the remaining part as proofOfPossession

    // Return the two parts as an object with '0x' prefix added back
    return {
        publicKey: '0x' + publicKey,
        proofOfPossession: '0x' + proofOfPossession
    };
}

// Calculate the lengths of the byte arrays before concatenation
function getLengthBeforeConcatenation(hex1, hex2) {
    let bytes1 = hexToBytes(hex1); // Convert first hex string to bytes
    let bytes2 = hexToBytes(hex2); // Convert second hex string to bytes
    
    // Return an object with the lengths of publicKey, proofOfPossession, and their total
    return {
        publicKeyLength: bytes1.length, // Length of publicKey in bytes
        proofOfPossessionLength: bytes2.length, // Length of proofOfPossession in bytes
        totalLength: bytes1.length + bytes2.length // Total length of both before concatenation
    };
}

// Calculate the total length of the byte array after concatenation
function getLengthAfterConcatenation(hex1, hex2) {
    let bytes1 = hexToBytes(hex1); // Convert first hex string to bytes
    let bytes2 = hexToBytes(hex2); // Convert second hex string to bytes
    
    // The length of the concatenated Uint8Array in bytes
    return bytes1.length + bytes2.length;
}

// Example usage
let publicKey = "0x8f95423f7142d00a48e1014a3de8d28907d420dc33b3052a6dee03a3f2941a393c2351e354704ca66a3fc29870282e15";
let proofOfPossession = "0x86a3ab4c45cfe31cae34c1d06f212434ac71b1be6cfe046c80c162e057614a94a5bc9f1ded1a7029deb0ba4ca7c9b71411e293438691be79c2dbf19d1ca7c3eadb9c756246fc5de5b7b89511c7d7302ae051d9e03d7991138299b5ed6a570a98";

// Removing "0x" prefix for processing
publicKey = publicKey.slice(2);
proofOfPossession = proofOfPossession.slice(2);

// Get length before concatenation
let beforeConcatLengths = getLengthBeforeConcatenation(publicKey, proofOfPossession);
console.log('Lengths before concatenation:', beforeConcatLengths);

// Concatenation
let concatenatedHex = concatHexStrings(publicKey, proofOfPossession);
console.log('Concatenated hex string: 0x' + concatenatedHex);

// Get length after concatenation
let afterConcatLength = getLengthAfterConcatenation(publicKey, proofOfPossession);
console.log('Length after concatenation:', afterConcatLength);

// Deconcatenation (assuming the length of the publicKey is 48 bytes)
let deconcatenated = deconcatHexString(concatenatedHex, 48);
console.log('Deconcatenated:', deconcatenated);
