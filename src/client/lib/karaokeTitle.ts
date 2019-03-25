// from: https://www.w3.org/TR/html4/sgml/entities.html
const entities = {
	quot : 34,
	amp  : 38
};

export default function cleanupKaraokeTitle(title) {
	return title
		.replace(/[\(\[][^\(\[]*karaoke.*[\)\]]/i, '')	// remove anything in brackets that has the word karaoke in it
		.replace(/karaoke\s*[\-(version)(hd)(lyrics)]?\s*/i, '')	// remove the word karaoke optionally followed by other key words
		.replace(/\*$/, '')
		// replace HTML entities with their actual character
		.replace(/&(.*?);/ig, function(all, charCode) {
			return String.fromCharCode(charCode[0] !== '#' ? entities[charCode] : charCode.slice(1));
		})
	;
}