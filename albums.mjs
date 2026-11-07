// The albums the site wears, a different one each visit. Their colours live in style.css under [data-album]; index.html picks the first one before paint.
export const ALBUMS = {
  up: { name: 'Unknown Pleasures', artist: 'Joy Division', tracks: ['Disorder', 'Day of the Lords', 'Candidate', 'Insight', 'New Dawn Fades', "She's Lost Control", 'Shadowplay', 'Wilderness', 'Interzone', 'I Remember Nothing'] },
  mm: { name: 'The Man-Machine', artist: 'Kraftwerk', tracks: ['The Robots', 'Spacelab', 'Metropolis', 'The Model', 'Neon Lights', 'The Man-Machine'] },
  dsotm: { name: 'The Dark Side of the Moon', artist: 'Pink Floyd', tracks: ['Speak to Me', 'Breathe', 'On the Run', 'Time', 'The Great Gig in the Sky', 'Money', 'Us and Them', 'Any Colour You Like', 'Brain Damage', 'Eclipse'] },
  brat: { name: 'brat', artist: 'Charli XCX', tracks: ['360', 'club classics', 'sympathy is a knife', 'i might say something stupid', 'talk talk', 'von dutch', 'everything is romantic', 'rewind', 'so i', 'girl, so confusing', 'apple', 'b2b', 'mean girls', 'i think about it all the time', '365'] },
  cur: { name: 'Currents', artist: 'Tame Impala', tracks: ['Let It Happen', 'Nangs', 'The Moment', "Yes I'm Changing", 'Eventually', 'Gossip', 'The Less I Know the Better', 'Past Life', 'Disciples', "'Cause I'm a Man", 'Reality in Motion', 'Love/Paranoia', 'New Person, Same Old Mistakes'] },
}

export const pick = list => list[Math.floor(Math.random() * list.length)]
