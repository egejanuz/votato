/******** SETUP ********/

// Stopwatch Instantiation //
var util    = require('util'),  
    events  = require('events'),
    _       = require('underscore');

// Express Instantiation //
const express = require('express');
const app = express();

// Middlewares //
app.use(express.static('public'));

//Listen on port 3000
let port = process.env.PORT || 5000;
server = app.listen(port);

//Routes
app.get('/', (req, res) => {
	res.sendFile('./public/index.html');
});

// Socket.io Instantiation //
const http = require('http').Server(app)
const io = require("socket.io")(server);

// Mongoose Instantiation //
const mongoose = require('mongoose');
const random = require('mongoose-simple-random');
const MONGOLAB_URI = process.env.MONGOLAB_URI;
mongoose.connect('mongodb://enkomaun:Songoku7@ds263639.mlab.com:63639/heroku_xdftf4pd');
mongoose.connection.on('error', console.error.bind(console, 'connection error'));

/******** STOPWATCH ********/
function Stopwatch() {  
    if(false === (this instanceof Stopwatch)) {
        return new Stopwatch();
    }

	this.clockStart = 360000;
    this.hour = 3600000;
    this.minute = 60000;
    this.second = 1000;
    this.time = this.clockStart;
    this.interval = undefined;

    events.EventEmitter.call(this);

    // Use Underscore to bind all of our methods
    // to the proper context
    _.bindAll(this, 'start', 'stop', 'reset', 'onTick');
};

/**** Inherit from EventEmitter ****/
util.inherits(Stopwatch, events.EventEmitter);

/**** Methods ****/
Stopwatch.prototype.start = function() {  
    if (this.interval) {
        return;
    }
    this.interval = setInterval(this.onTick, this.second);
    this.emit('start:stopwatch');
};

Stopwatch.prototype.stop = function() {  
    if (this.interval) {
        clearInterval(this.interval);
        this.interval = undefined;
        this.emit('stop:stopwatch');
    }
};

Stopwatch.prototype.reset = function() {  
    this.time = this.clockStart;
    this.emit('reset:stopwatch', this.formatTime(this.time));
};

Stopwatch.prototype.onTick = function() {  
    this.time -= this.second;

    var formattedTime = this.formatTime(this.time);
    this.emit('tick:stopwatch', formattedTime);

    if (this.time === -1000) {
        this.reset();
    }
};

Stopwatch.prototype.formatTime = function(time) {  
    var remainder = time,
        numMinutes,
        numSeconds,
        output = "";

    numMinutes = String(parseInt(remainder / this.minute, 10));
    remainder -= this.minute * numMinutes;

    numSeconds = String(parseInt(remainder / this.second, 10));

    output = _.map([numMinutes, numSeconds], function(str) {
        if (str.length === 1) {
            str = "0" + str;
        }
        return str;
    }).join(":");

    return output;
};

Stopwatch.prototype.getTime = function() {  
    return this.formatTime(this.time);
};

/******** DATABASE ********/

/**** Schemas ****/
const UsersSchema = new mongoose.Schema({
	socketID: String,
	username: String,
	avatar: String,
	thumbnail: String,
	money: Number,
	visible: Boolean,
	town_score_contribution_graph: [Number],
	money_graph: [Number]
});

const MessagesSchema = new mongoose.Schema({
	username: String,
	message: String,
	timestamp: {
		type: Date,
		default: Date.now
	}
});

const TownSchema = new mongoose.Schema({
	name: String,
	population: Number,
	town_score: Number,
	gdp: Number,
	town_score_graph: [Number],
	width: Number,
	height: Number
});

/**** Schema Methods ****/
TownSchema.statics.updateStats = (property, action, data) => {
	Town.update({}, {
		[action]: {
			[property]: data
		}
	}, function (error, result) {
		if (error) throw error;
		Town.findOne({}, (error, result) => {
			if (error) throw error;
			io.sockets.emit(`change_${property}`, {
				[property]: result[property]
			});
		});
	});
}

UsersSchema.statics.updateMoney = function (user, action, data) {
	User.update({socketID: user.socketID}, {[action]: {money: data}, $push: {money_graph: data}}, (error) => {
		if (error) throw error;
		User.findOne({
			socketID: user.socketID
		}, (error, result) => {
			if (error) throw error;
			io.to(result.socketID).emit('change_money', {
				money: result.money
			});
		});
	});

	Town.updateStats('gdp', '$inc', data);	
}

/**** Models ****/
UsersSchema.plugin(random);
const User = mongoose.model('user', UsersSchema);
const Message = mongoose.model('message', MessagesSchema);
const Town = mongoose.model('town', TownSchema);


/******** VOTING SYSTEM ********/

/**** Template Classes ****/
class Issue {
	constructor(title, description, firstOption, secondOption) {
		this.title = title;
		this.description = description;
		this.firstOption = firstOption;
		this.secondOption = secondOption;
	}
}

class Option {
	constructor(title, tooltip, message, effect) {
		this.title = title;
		this.tooltip = tooltip;
		this.message = message;
		this.effect = effect;
	}
}

/**** Issues Array ****/
let issueArray = [
	//Issue #1
	new Issue(
		'Forest Fire',
		'The woodlands to the north were reduced to a crisp by a series of forest fires. Some have called for a <strong>crowdfunded reforestation of the area</strong>, while others see the fire as an opportunity to expand the city and <strong>build more affordable housing.</strong> What should be done?',
		new Option(
			'Crowdfund a reforestation effort.',
			`<h3><strong>CHIP IN, EVERYBODY:</strong> Everyone loses 100p.</h3>
			<h3><strong>KEEP IT GREEN:</strong> Increases town score by 10.</h3>`,
			`everyone chipped in 100p, but the Town Score increased by 10!`,
			[
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: -100 },
				{ functionName: 'changeTownScore', amount: 10 }
			]
		),
		new Option(
			'Invest in affordable housing.',
			`<h3><strong>AND YOU GET A HOME:</strong> 3 random people gain 100p.</h3>
			<h3><strong>KA-CHING!:</strong> The richest 3 people gain 200p.</strong></h3>
			<h3><strong>IT'S ALL CHARCOAL:</strong> Decreases town score by 10.</h3>`,
			`the town score decreased by 10, but 8 citizens' fortunes grew by up to 200p!`,
			[
				{ functionName: 'changeUserMoney', method: 'random', sampleSize: 3, amount: 100 },
				{ functionName: 'changeUserMoney', method: 'richest', sampleSize: 3, amount: 200 },
				{ functionName: 'changeTownScore', amount: -10 }
			]
		)
	),
	//Issue #2
	new Issue(
		'Commute Reform',
		'The town has grown, but its public transport hasn’t grown with it. Two proposals are on the table regarding new public transportation. <strong>Increasing the amount of buses</strong> would be cheaper and serve urban and suburban communities alike, but would be less friendly to the environment. On the other hand, <strong>installing a brand new electric tram system</strong> would greatly reduce gestation in the urban area at little risk to the environment, but it would be highly expensive. Which option do we go with?',
		new Option(
			'Expand bus network.',
			`<h3><strong>WALLET BURNER:</strong> Everyone loses 50p.</h3>
			<h3><strong>HOP IN, EVERYONE:</strong> 5 random people gain 100p.</strong></h3>
			<h3><strong>GAS GUZZLERS:</strong> Decreases town score by 10.</h3>`,
			`everyone chipped in 50p, resulting in a public transit system that fits the needs of everyone!`,
			[
				{ functionName: 'changeUserMoney', method: 'random', sampleSize: 5, amount: 100 },
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: -50 },
				{ functionName: 'changeTownScore', amount: -10 }
			]
		),
		new Option(
			'Build electric tram system.',
			`<h3><strong>WALLET BURNER:</strong> Everyone loses 200p.</h3>
			<h3><strong>FAST URBAN COMMUTE:</strong> 3 random people gain 100p.</strong></h3>
			<h3><strong>CLEAN TRANSIT:</strong> Increases town score by 10.</h3>`,
			`everyone chipped in 200p, resulting in better, greener commutes for urban residents!`,
			[
				{ functionName: 'changeUserMoney', method: 'random', sampleSize: 3, amount: 100 },
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: -200 },
				{ functionName: 'changeTownScore', amount: 10 }
			]
		)
	),
	
	//Issue #3
	new Issue(
		'Save the Cods',
		'Votatopia is a fishing town! Hobbyists and professionals alike go over to the coast to fish almost every day. However, it has gotten to the point that overfishing has led to the <strong>Potato Cod</strong>, a local delicacy, becoming endangered. Environmentalists call for the fish to be <strong>preserved by creating no-fish zones</strong>, while fishers whose livelihoods depend on fishing potato cod think that <strong>fishing should go on without limitations.</strong> What should be done?',
		new Option(
			'Preserve the fish.',
			
			`<h3><strong>NEW PRESERVATIONS:</strong> Everyone loses 100p.</h3>
			<h3><strong>NO MORE FISHING:</strong> 3 random people lose 200p.</strong></h3>
			<h3><strong>HEALTHY ECOSYSTEM:</strong> Town score remains the same.</h3>`,
			
			'everyone chipped in to create preservation sites around fishing spots, conserving the environment at the expense of the local fisherpotatoes.',
			[
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: -100 },
				{ functionName: 'changeUserMoney', method: 'random', sampleSize: 3, amount: -200 },
			]
		),
		new Option(
			'Eat the fish.',
			`<h3><strong>COD ECONOMICS:</strong> Everyone gains 150p.</h3>
			<h3><strong>NATURAL RAMIFICATIONS:</strong> Town score decreased by 10.</h3>`,
			'the popular local activity of fishing was preserved, but the environmental costs remain to be seen.',
			[
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: 100 },
				{ functionName: 'changeTownScore', amount: -10 }
			]
		)
	),
	//Issue #4
	new Issue(
		'Flood in the City',
		`An older neighborhood was tragically flooded overnight, causing a massive loss of lives and property. An emergency flood relief program has been drafted, and there are two options as to how to fund it: either <strong>through taxpayer money,</strong> or <strong>through the donations of the town's affluent.</strong> The choice of which rests on the community.`,
		new Option(
			'Fund aid through taxpayer money.',
			`<h3><strong>CHIP IN, EVERYONE:</strong> Everyone loses 100p.</h3>
			<h3><strong>STILL FLOODED:</strong> Decreases town score by 10.</h3>`,
			'the emergency fund is secured, but the town is still flooded, and loses 10 Town Score.',
			[
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: -100 },
				{ functionName: 'changeTownScore', amount: -10 },
			]
		),
		new Option(
			'Fund aid through donations.',
			`<h3><strong>BIG CHECKS:</strong> The richest 3 people lose 250p.</h3>
			<h3><strong>STILL FLOODED:</strong> Decreases town score by 10.</h3>`,
			'the emergency fund is secured, but the town is still flooded, and loses 10 Town Score.',
			[
				{ functionName: 'changeUserMoney', method: 'richest', sampleSize: 3, amount: -250 },
				{ functionName: 'changeTownScore', amount: -10 }
			]
		)
	),
	
	//Issue #5
	new Issue(
		'Dampened Efforts',
		`The relief program for the flooded neighborhood has run out of funds much quicker than anticipated. The flood relief commission has decided to focus the rest of their funds on only one of their goals: <strong>rehousing the survivors,</strong> or <strong>restoring the neighborhood.</strong>`,
		new Option(
			'Rehouse the survivors.',
			`<h3><strong>SAVE THE NEEDY:</strong> Nobody loses anything!</h3>
			<h3><strong>WRECKED NEIGHBORHOOD:</strong> Decreases town score by 10.</h3>`,
			'the aid program succeeded in saving the survivors, but the neighborhood was left in a destitute condition, reducing the Town Score by 10.',
			[
				{ functionName: 'changeTownScore', amount: -10 },
			]
		),
		new Option(
			'Restore the neighborhood.',
			`<h3><strong>MASS PROPERTY LOSS:</strong> The poorest 3 people lose 250p.</h3>
			<h3><strong>SAVE THE TOWN:</strong> Increases town score by 10.</h3>`,
			'the neighborhood was saved, but its residents were not, reducing their funds by 250p.',
			[
				{ functionName: 'changeUserMoney', method: 'poorest', sampleSize: 3, amount: -250 },
				{ functionName: 'changeTownScore', amount: 10 }
			]
		)
	),
		
	//Issue #6
	new Issue(
		'Third Wave Coffee Shops',
		`The town's looking prettier than ever with all these new places opening up. It's surely drawing attention to the town, but at the same time, residents have been in protest over their skyrocketing rents. Protesters demand <strong>the implementation of rent control</strong> so residents aren't driven out, while developers argue that doing so would <strong>stifle the town's growth</strong> making it worse for everyone in the long run. How should we go at this?`,
		new Option(
			'Implement rent control.',
			`<h3><strong>FOR THE PEOPLE:</strong> 3 random people gain 100p.</h3>
			<h3><strong>LOSS ON INVESTMENT:</strong> The richest 3 people lose 300p.</h3>
			<h3><strong>IS THE TOWN BETTER OFF?:</strong> Increases town score by a random amount.</h3>`,
			'the residents of the gentrified area got to keep their homes, gaining 100p. However, investments in the area were stifled, and investors lost 300p.',
			[
				{ functionName: 'changeUserMoney', method: 'random', sampleSize: 3, amount: 100 },
				{ functionName: 'changeUserMoney', method: 'richest', sampleSize: 3, amount: -300 },
				{ functionName: 'changeTownScore', amount: Math.floor(Math.random() * 10 + 1) }
			]
		),
		new Option(
			'Leave things the way they are.',
			`<h3><strong>DRIVEN OUT:</strong> 3 random people lose 200p.</h3>
			<h3><strong>THE RICH GET RICHER:</strong> The richest 3 people gain 300p.</h3>
			<h3><strong>IS THE TOWN BETTER OFF?:</strong> Increases town score by a random amount.</h3>`,
			'investments in the town continue to grow, enriching current investors by 300p. However, some of the original residents of the area were driven out of their homes, and lost 200p.',
			[
				{ functionName: 'changeUserMoney', method: 'random', sampleSize: 3, amount: -200 },
				{ functionName: 'changeUserMoney', method: 'richest', sampleSize: 3, amount: 300 },
				{ functionName: 'changeTownScore', amount: Math.floor(Math.random() * 10 + 1) }
			]
		)
	),
	
	//Issue #7
	new Issue(
		'Trash, Trash Everywhere',
		`We have to admit, the town has a trash problem. The junkyards are filled to the brim, trash collectors are overworked, and the streets are getting kinda smelly. Two proposals have been made to solve the issue. We can <strong>burn it for cheap</strong>, and generate some energy on top of it. Alternatively, we can <strong>initiate a recycling program,</strong> helping the environment to boot.`,
		new Option(
			'Burn the trash.',
			`<h3><strong>POWER SURPLUS:</strong> Everyone gains 100p.</h3>
			<h3><strong>SMOG AND GRIME:</strong> Decreases town score by 10.</h3>`,
			'we began burning the *cough* trash away, generating a lot of surplus *cough* energy! Everyone gains 100p out of the *cough* surplus, but the town score was decreased by 10 due to *cough* environmental damage.',
			[
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: 100 },
				{ functionName: 'changeTownScore', amount: -10 }
			]
		),
		new Option(
			'Recycle the trash.',
			`<h3><strong>THIS IS COSTLY:</strong> Everyone loses 150p.</h3>
			<h3><strong>FRESH AIR:</strong> Increases town score by 10.</h3>`,
			'a sound investment of 150p was made by the whole town to build a recycling facilities, which cleaned up the town so much that its Town Score was increased by 10!',
			[
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: -150 },
				{ functionName: 'changeTownScore', amount: 10 }
			]
		)
	),
	
	//Issue #8
	new Issue (
		`Potato Flu`,
		`A particularly awful strain of the potato flu has broken out in town! Things look pretty bad, most of those infected have been hospitalized, and are highly infectious. The town has to choose between two options to contain the disease before it spreads to everyone: either <strong>quarantine the infected</strong> until they get better, or <strong>initiate a vaccination program</strong> that will immunize the whole populace before they are infected.`,
		new Option(
			'Quarantine the sick.',
			`<h3><strong>TOWN IN QUARANTINE: </strong>Decreases town score by 10.</h3>`,
			'',
			[
				{ functionNmae: 'changeTownScore', amount: -10 }
			]
		
		),
		new Option(
			'Vaccinate everyone.',
			`<h3><strong>COSTLY EFFORT: </strong>Everyone loses 100p.</h3>`,
			'',
			[
				{ functionName: 'changeUserMoney', method: 'all', sampleSize: '', amount: -100 }
			]
		
		)
	)
];

//Variables Related to Voting
let voteCount = 0;
let votesForA = 0;
let votesForB = 0;

/**** Vote System Countdown ****/

let renderNewIssue = function() {
	let issue = issueArray[voteCount];
	io.sockets.emit('new-issue', {
		title: issue.title,
		description: issue.description,
		optionTitleA: issue.firstOption.title,
		optionTooltipA: issue.firstOption.tooltip,
		optionEffectA: issue.firstOption.effect,
		optionTitleB: issue.secondOption.title,
		optionTooltipB: issue.secondOption.tooltip,
		optionEffectB: issue.secondOption.effect
	});
}

let tallyVotes = function() {
	let winningOption ='';
	if (!(votesForA === 0 && votesForB === 0)) {
		winningOption = (votesForA > votesForB) ? "firstOption" : "secondOption";
		let majorityVotes = (votesForA > votesForB) ? votesForA : votesForB;
	}
	votesForA = 0;
	votesForB = 0;	
	
	let result = issueArray[voteCount][winningOption].effect;
			let resultTitle = issueArray[voteCount][winningOption].title;
			let resultMessage = issueArray[voteCount][winningOption].message;
			
			
			Town.findOne({}, (error, town) => {
				let population = town.population;
				let votePayout = 100 + town.town_score;
				
				result.forEach((effect) => {
					if(effect.functionName === "changeTownScore") {
						changeTownScore(effect.amount);
					} else if (effect.functionName === "changeUserMoney") {
						changeUserMoney(effect.method, effect.sampleSize, effect.amount);
					}
				});
				
				changeUserMoney('all', 0, votePayout);
				let votePercentage = Math.floor((data.majorityVotes / population) * 100);
				socket.emit('vote_rundown', {
					votePercentage: votePercentage,
					resultTitle: resultTitle,
					resultMessage: resultMessage,
					votePayout: votePayout
				});		
			});	
}

/**** Stopwatch Instantiation ****/
var stopwatch = new Stopwatch();

io.sockets.emit('time', {
	time: stopwatch.getTime()
});

stopwatch.on('tick:stopwatch', function (time) {
	io.sockets.emit('time', {
		time: time
	});
});

//On Countdown End
stopwatch.on('reset:stopwatch', function (time) {
	//Tally votes
	tallyVotes();
	
	//Send resetted time to clients
	io.sockets.emit('time', {
		time: time
	});

	//Increase vote count
	voteCount++;
	if (voteCount > (issueArray.length - 1)) voteCount = 0;
	
	//Render new issue
	renderNewIssue();
});

stopwatch.start();


/******** CONNECTION ********/

// Connect to Mongoose //
mongoose.connection.once('open', function () {
	
	// STEP 1: Initialize Town //
	const town = new Town({
		name: "Votatopia",
		population: 0,
		town_score: 0,
		gdp: 0
	});
	town.save((error) => {
		if (error) throw error;
	});

	// STEP 2: Connect to Socket.io //
	io.on('connection', (socket) => {
		
		//Initialize Countdown and First Issue
		let issue = issueArray[voteCount];
		socket.emit('new-issue', {
			title: issue.title,
			description: issue.description,
			optionTitleA: issue.firstOption.title,
			optionTooltipA: issue.firstOption.tooltip,
			optionEffectA: issue.firstOption.effect,
			optionTitleB: issue.secondOption.title,
			optionTooltipB: issue.secondOption.tooltip,
			optionEffectB: issue.secondOption.effect
		});
		
		/**** Initialization Methods ****/
		let populateTown = function() {
			User.find({}).lean().exec(function (error, result) {
				result.forEach((user) => {
					if (user.visible) {
						socket.emit('place_user_avatar', {
							_id: user._id,
							avatar: user.avatar
						});
					}
				});
			});
		}

		let assignMoney = function() {
			let rng = Math.floor(Math.random() * (6));
			switch (rng) {
				case 0:
				case 1:
					return 125;
				case 2:
				case 3:
				case 4:
					return 250;
				case 5:
					return 500;
				default:
					break;
			}
		}

		/**** Vote System Methods ****/
		let changeUserMoney = function(method, sampleSize, amount) {
			if (method === "all") {
				User.find({
					visible: true
				}, (error, result) => {
					if (error) throw error;
					result.forEach((user) => {
						User.updateMoney(user, '$inc', amount);
					});
				});
			} else if (method === "random") {
				User.findRandom({
					visible: true
				}, {}, {
					limit: sampleSize
				}, (error, result) => {
					if (error) throw error;
					result.forEach((user) => {
						User.updateMoney(user, '$inc', amount);
					});
				});
			} else if (method === "richest") {
				User.find({
					visible: true
				}).sort({
					money: -1
				}).slice('money', 5).exec((error, result) => {
					if (error) throw error;
					for (let i = 0; i < result.length; i++) {
						User.updateMoney(result[i], '$inc', amount);
					}
				});

			} else if (method === "poorest") {
				User.find({
					visible: true
				}).sort({
					money: 1
				}).slice('money', 5).exec((error, result) => {
					if (error) throw error;
					for (let i = 0; i < result.length; i++) {
						User.updateMoney(result[i], '$inc', amount);
					}
				});
			}
		}

		let changeTownScore = function(amount) {
			Town.update({}, {$push: {town_score_graph: amount}}, (error) => {
				Town.updateStats('town_score', '$inc', amount);
			});
			
		}
		
		/**** VOTE: Response and Effect Handling ****/
		
		//tally responses for tallyVote function
		socket.on('client-vote', (data) => {
			if(data.decision === 'option-A') {
				votesForA++;
				votesForB--;
			} else if (data.decision === 'option-B') {
				votesForA--;
				votesForB++;
			}	
		});
		
		socket.on('client-vote:first', (data) => {
			if(data.decision === 'option-A') {
				votesForA++;
			} else if (data.decision === 'option-B') {
				votesForB++;
			}	
		});
		
		//Handle Vote End
		socket.on('vote_finished', (data) => {
			let result = issueArray[data.voteCount][data.winningOption].effect;
			let resultTitle = issueArray[data.voteCount][data.winningOption].title;
			let resultMessage = issueArray[data.voteCount][data.winningOption].message;
			
			
			Town.findOne({}, (error, town) => {
				let population = town.population;
				let votePayout = 100 + town.town_score;
				
				result.forEach((effect) => {
					if(effect.functionName === "changeTownScore") {
						changeTownScore(effect.amount);
					} else if (effect.functionName === "changeUserMoney") {
						changeUserMoney(effect.method, effect.sampleSize, effect.amount);
					}
				});
				
				changeUserMoney('all', 0, votePayout);
				let votePercentage = Math.floor((data.majorityVotes / population) * 100);
				socket.emit('vote_rundown', {
					votePercentage: votePercentage,
					resultTitle: resultTitle,
					resultMessage: resultMessage,
					votePayout: votePayout
				});		
			});		
		});
		
		
		populateTown(); // add existing user avatars to the city
		

		// STEP 3: Initialize User //
		//Assign default values
		socket.username = "Anonymous";
		socket.avatar = "assets/characters/m_neutral.svg";
		socket.thumbnail = "assets/thumbnails/m_neutral_thumb.svg";
		socket.money = assignMoney();


		/* Create and save new user */
		let user = new User({
			socketID: socket.id,
			username: socket.username,
			avatar: socket.avatar,
			thumbnail: socket.thumbnail,
			money: socket.money,
			visible: true
		});
		
		user.save((error) => {
			Town.updateStats('population', '$inc', 1);
			Town.updateStats('town_score', '$inc', 0);
			User.updateMoney(user, '$set', user.money);
			io.sockets.emit('place_user_avatar', {
				_id: user._id,
				avatar: socket.avatar
			});
		});

		/**** UPDATING ****/
		// Listen on profile edits //
		socket.on('edit_profile', (data) => {
			io.sockets.emit('remove_user_avatar', {
				_id: user._id,
				avatar: socket.avatar
			});
			/* UPDATE DATABASE */
			User.update({
				_id: user._id.toString()
			}, {
				$set: {
					username: data.username,
					avatar: data.avatar,
					thumbnail: data.thumbnail
				}
			}, function (error) {
				if (error) throw error;
			});

			/* UPDATE SOCKET INFO */
			socket.username = data.username;
			socket.avatar = data.avatar;
			socket.thumbnail = data.thumbnail;
			io.sockets.emit('place_user_avatar', {
				_id: user._id,
				avatar: socket.avatar
			});
		});

		/**** Listen on New Messages ****/
		socket.on('new_message', (data) => {
			/* UPDATE DATABASE */
			var newMessage = new Message({
				username: socket.username,
				message: data.message
			});
			newMessage.save(function (error) {
				if (error) throw error;

				/* EMIT MESSAGE */
				io.sockets.emit('new_message', {
					thumbnail: socket.thumbnail,
					username: socket.username,
					message: data.message
				});
			});
		});

		socket.on('request-user-info', (data) => {
			User.findOne({
				_id: data._id
			}, (error, result) => {
				if (error) throw error;
				if (result) {
					socket.emit('user-info-tooltip', {
						username: result.username,
						money: result.money
					});
				}
			});
		});
		

		/**** DISCONNECTION ****/
		socket.once('disconnect', (socket) => {
			Town.updateStats("population", "$inc", -1);

			User.findOne({
				socketID: user.socketID
			}, (error, result) => {
				if (error) throw error;
				Town.updateStats('gdp', '$inc', (-1 * result.money));
			});

			User.update({
				_id: user._id
			}, {
				$set: {
					visible: false
				}
			}, function (error) {
				if (error) throw error;
				io.sockets.emit('remove_user_avatar', {
					_id: user._id,
					avatar: user.avatar
				});
			});
		});
	});
});