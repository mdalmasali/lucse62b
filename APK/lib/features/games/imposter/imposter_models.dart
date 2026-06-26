import 'dart:math';

/// A word pack for the Imposter game (mirrors the website's WORD_PACKS).
class WordPack {
  final String key;
  final String label;
  final String icon;
  final List<String> words;
  const WordPack(this.key, this.label, this.icon, this.words);
}

const _movies = ['Avatar','Inception','Titanic','The Dark Knight','Interstellar','Parasite','Joker','Avengers','Frozen','Lion King','The Matrix','Gravity','Forrest Gump','Gladiator','The Godfather','Braveheart','Saving Private Ryan','Spirited Away','Your Name','Spider-Man','Black Panther','Coco','Finding Nemo','Shrek','Up','Toy Story','Jurassic Park','Star Wars','Harry Potter','The Lord of the Rings','Pirates of the Caribbean','Iron Man','Deadpool','Doctor Strange','Wall-E','Ratatouille','Inside Out','Kung Fu Panda','Moana','Aladdin','The Incredibles','Jumanji','Mad Max','Dune','Oppenheimer'];
const _sports = ['Cricket','Football','Basketball','Tennis','Badminton','Swimming','Boxing','Golf','Volleyball','Cycling','Wrestling','Archery','Table Tennis','Hockey','Kabaddi','Athletics','Gymnastics','Judo','Karate','Shooting','Fencing','Rowing','Snooker','Dart','Skiing','Surfing','Skateboarding','Rugby','Baseball','Handball','Polo','Squash','Sailing','Diving','Marathon','Weightlifting','Taekwondo','Climbing','Bowling','Ice Skating','Sumo','Snowboarding','Cross Country','Triathlon','Curling'];
const _animals = ['Lion','Tiger','Elephant','Giraffe','Penguin','Dolphin','Eagle','Crocodile','Kangaroo','Koala','Cheetah','Gorilla','Panda','Polar Bear','Zebra','Hippo','Rhino','Parrot','Flamingo','Octopus','Shark','Whale','Butterfly','Peacock','Chameleon','Camel','Owl','Wolf','Fox','Bear','Deer','Squirrel','Hedgehog','Sloth','Otter','Seal','Jellyfish','Seahorse','Lobster','Snail','Bat','Raccoon','Leopard','Jaguar','Toucan'];
const _food = ['Pizza','Biryani','Sushi','Burger','Pasta','Tacos','Ramen','Kebab','Samosa','Lasagna','Pancake','Cheesecake','Naan','Fried Rice','Shawarma','Falafel','Spring Roll','Dim Sum','Curry','Dumpling','Gelato','Croissant','Momos','Pho','Baklava','Hot Dog','Waffle','Donut','Cupcake','Burrito','Nachos','Risotto','Paella','Gyro','Bagel','Pretzel','Macaron','Tiramisu','Brownie','Smoothie','Omelette','Sandwich','Noodles','Steak','Pudding'];
const _bangla = ['ঢাকা','রিকশা','ইলিশ','সুন্দরবন','পদ্মা','শাপলা','কাঁঠাল','পহেলা বৈশাখ','জামদানি','নকশীকাঁথা','ভাপা পিঠা','মুক্তিযুদ্ধ','মেলা','পুকুর','নৌকা','ঘুড়ি','লুডু','ক্যারম','শীতের সকাল','বৃষ্টি','চা','ইট ভাটা','হাওর','বাঁশ বন','মসজিদ','চিতই পিঠা','মিষ্টি','রসগোল্লা','পান্তা ভাত','কদম ফুল','কোকিল','ধানক্ষেত','গরুর গাড়ি','তাল গাছ','শাপলা বিল','চাঁদনি রাত','বটগাছ','কুমির','জোনাকি','মাছ ধরা','পালকি','কাঁসা','হাট','বরই','আমড়া'];

final List<WordPack> kWordPacks = [
  WordPack('random', 'Random Mix', '🎲', [..._movies, ..._sports, ..._animals, ..._food, ..._bangla]),
  WordPack('movies', 'Movies', '🎬', _movies),
  WordPack('sports', 'Sports', '⚽', _sports),
  WordPack('animals', 'Animals', '🦁', _animals),
  WordPack('food', 'Food', '🍕', _food),
  WordPack('bangla', 'বাংলা', '🇧🇩', _bangla),
];

WordPack wordPackByKey(String key) =>
    kWordPacks.firstWhere((p) => p.key == key, orElse: () => kWordPacks.first);

/// Pick a fresh word from [packKey] excluding the room's already-[used] words.
String pickWord(String packKey, List<String> used) {
  final words = wordPackByKey(packKey).words.toSet().toList();
  final usedSet = used.toSet();
  final pool = words.where((w) => !usedSet.contains(w)).toList();
  final from = pool.isNotEmpty ? pool : words;
  return from[Random().nextInt(from.length)];
}

/// A `game_rooms` row.
class ImposterRoom {
  final String roomCode;
  final String hostId;
  final String status; // lobby | role_reveal | discuss | vote | result
  final String? word;
  final String wordPack;
  final int imposterCount;
  final int discussionTime;
  final int votingTime;
  final int roundsTotal;
  final int roundsCurrent;
  final int maxPlayers;
  final bool isPrivate;
  final bool guestsAllowed;
  final bool skipVote;
  final bool revealAtEnd;
  final int crewmateScore;
  final int imposterScore;
  final List<String> usedWords;
  final bool standingsDone;
  final DateTime? phaseEndsAt;

  const ImposterRoom({
    required this.roomCode,
    required this.hostId,
    required this.status,
    required this.word,
    required this.wordPack,
    required this.imposterCount,
    required this.discussionTime,
    required this.votingTime,
    required this.roundsTotal,
    required this.roundsCurrent,
    required this.maxPlayers,
    required this.isPrivate,
    required this.guestsAllowed,
    required this.skipVote,
    required this.revealAtEnd,
    required this.crewmateScore,
    required this.imposterScore,
    required this.usedWords,
    required this.standingsDone,
    required this.phaseEndsAt,
  });

  static int _i(Object? v, [int d = 0]) => v is int ? v : int.tryParse('${v ?? ''}') ?? d;
  static bool _b(Object? v, [bool d = false]) => v is bool ? v : (v == null ? d : '$v' == 'true');

  factory ImposterRoom.fromMap(Map<String, dynamic> m) => ImposterRoom(
        roomCode: '${m['room_code']}',
        hostId: '${m['host_id']}',
        status: '${m['status'] ?? 'lobby'}',
        word: m['word'] as String?,
        wordPack: '${m['word_pack'] ?? 'random'}',
        imposterCount: _i(m['imposter_count'], 1),
        discussionTime: _i(m['discussion_time'], 60),
        votingTime: _i(m['voting_time'], 60),
        roundsTotal: _i(m['rounds_total'], 1),
        roundsCurrent: _i(m['rounds_current'], 1),
        maxPlayers: _i(m['max_players'], 8),
        isPrivate: _b(m['is_private']),
        guestsAllowed: _b(m['guests_allowed'], true),
        skipVote: _b(m['skip_vote']),
        revealAtEnd: _b(m['reveal_at_end'], true),
        crewmateScore: _i(m['crewmate_score']),
        imposterScore: _i(m['imposter_score']),
        usedWords: (m['used_words'] as List?)?.map((e) => '$e').toList() ?? const [],
        standingsDone: _b(m['standings_done']),
        phaseEndsAt: m['phase_ends_at'] != null ? DateTime.tryParse('${m['phase_ends_at']}') : null,
      );
}

/// A `game_players` row.
class ImposterPlayer {
  final String playerId;
  final String playerName;
  final bool isHost;
  final bool isImposter;
  final bool isApproved;
  final bool isReady;
  final String? voteFor;
  final DateTime? leftAt;

  const ImposterPlayer({
    required this.playerId,
    required this.playerName,
    required this.isHost,
    required this.isImposter,
    required this.isApproved,
    required this.isReady,
    required this.voteFor,
    required this.leftAt,
  });

  bool get active => isApproved && leftAt == null;

  factory ImposterPlayer.fromMap(Map<String, dynamic> m) => ImposterPlayer(
        playerId: '${m['player_id']}',
        playerName: '${m['player_name'] ?? ''}',
        isHost: ImposterRoom._b(m['is_host']),
        isImposter: ImposterRoom._b(m['is_imposter']),
        isApproved: ImposterRoom._b(m['is_approved']),
        isReady: ImposterRoom._b(m['is_ready']),
        voteFor: m['vote_for'] as String?,
        leftAt: m['left_at'] != null ? DateTime.tryParse('${m['left_at']}') : null,
      );
}
