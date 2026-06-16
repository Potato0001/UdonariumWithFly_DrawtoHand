import { Card, CardState } from './card';
import { ImageFile } from './core/file-storage/image-file';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { ObjectNode } from './core/synchronize-object/object-node';
import { DataElement } from './data-element';
import { PeerCursor } from './peer-cursor';
import { TabletopObject } from './tabletop-object';
import { EventSystem, Network } from './core/system';
import { moveToBackmost, moveToTopmost } from './tabletop-object-util';
import { ObjectStore } from './core/synchronize-object/object-store';

@SyncObject('card-stack')
export class CardStack extends TabletopObject {
  @SyncVar() rotate: number = 0;
  @SyncVar() zindex: number = 0;
  @SyncVar() owner: string = '';
  @SyncVar() isShowTotal: boolean = true;
  @SyncVar() isLocked: boolean = false;
  
  get name(): string { return this.getCommonValue('name', ''); }
  get ownerName(): string {
    let object = PeerCursor.findByUserId(this.owner);
    return object ? object.name : '';
  }
  get ownerColor(): string {
    let object = PeerCursor.findByUserId(this.owner);
    return object ? object.color : '#444444';
  }
  get hasOwner(): boolean { return 0 < this.owner.length; }
  get ownerIsOnline(): boolean { return this.hasOwner && Network.peers.some(peer => peer.userId === this.owner && peer.isOpen); }

  private get cardRoot(): ObjectNode {
    for (let node of this.children) {
      if (node.getAttribute('name') === 'cardRoot') return node;
    }
    return null;
  }
  get cards(): Card[] { return this.cardRoot ? <Card[]>this.cardRoot.children : []; }
  get topCard(): Card { return this.isEmpty ? null : this.cards[0]; }
  get isEmpty(): boolean { return this.cards.length < 1 }
  get imageFile(): ImageFile { return this.topCard ? this.topCard.imageFile : null; }

  complement(): void {
    this.cards.forEach(card => card.complement());
  }

  // ObjectNode Lifecycle
  onChildRemoved(child: ObjectNode) {
    super.onChildRemoved(child);
    if (child instanceof Card) {
      EventSystem.trigger('CARD_STACK_DECREASED', { cardStackIdentifier: this.identifier, cardIdentifier: child.identifier });
    }
  }

  shuffle(): Card[] {
    if (!this.cardRoot) return;
    let length = this.cardRoot.children.length;
    for (let card of this.cards) {
      card.index = Math.random() * length;
      card.rotate = Math.floor(Math.random() * 2) * 180;
      this.setSamePositionFor(card);
    }
    return this.cards;
  }

  drawCard(): Card {
    let card = this.topCard ? this.cardRoot.removeChild(this.topCard) : null;
    if (card) {
      card.rotate += this.rotate;
      if (360 < card.rotate) card.rotate -= 360;
      this.setSamePositionFor(card);
      card.toTopmost();
    }
    return card;
  }

  drawToHand(owner: string): Card {
    // 1. Draw the top card natively
    let card = this.drawCard();
    if (!card) return null;
  
    // 2. Local Sandbox Fallback Check:
    // If online Peer ID is missing, try to bind to your local session nickname or a fallback string
    if (!owner || owner.trim() === "") {
      // Falls back to a local string asset so Udonarium treats it as uniquely owned by you
      card.owner = 'local-player-sandbox';
    } else {
      card.owner = owner;
    }
  
    // 3. Force face-down for everyone else, while revealing its face to the owner
    card.state = 1; 
  
    // 4. Set the native grid placement coordinates
    card.location.name = 'table';
    card.location.x = this.location.x + 32;
    card.location.y = this.location.y + 32;
    card.altitude = this.altitude; 
  
    // 5. Broadcast updates to the active rendering layers
    card.update();
    return card;
  }

  drawCardAll(): Card[] {
    let cards = this.cards;
    for (let card of cards) {
      this.cardRoot.removeChild(card);
      card.rotate += this.rotate;
      this.setSamePositionFor(card);
      if (360 < card.rotate) card.rotate -= 360;
    }
    return cards;
  }

  faceUp() {
    if (this.topCard) {
      this.topCard.faceUp();
      this.setSamePositionFor(this.topCard);
    }
  }

  faceDown() {
    if (this.topCard) {
      this.topCard.faceDown();
      this.setSamePositionFor(this.topCard);
    }
  }

  faceUpAll() {
    for (let card of this.cards) {
      card.faceUp();
      this.setSamePositionFor(card);
    }
  }

  faceDownAll() {
    for (let card of this.cards) {
      card.faceDown();
      this.setSamePositionFor(card);
    }
  }

  uprightAll() {
    for (let card of this.cards) {
      card.rotate = 0;
      this.setSamePositionFor(card);
    }
  }

  inverse() {
    const tmp: Card[] = [];
    while (true) {
      let card = this.topCard ? <Card>this.cardRoot.removeChild(this.topCard) : null;
      if (card == null) break;
      tmp.unshift(card);
      card.state = (card.state == CardState.FRONT ? CardState.BACK : CardState.FRONT);
    }
    for (let card of tmp) {
      this.putOnBottom(card);
    }
  }

  layoutDeck(targetState: number, onlyMe: boolean = false) {
    const cardsToSpread = [...this.cards]; 
    if (cardsToSpread.length === 0) return;
  
    const intervalX = 60; 
    const startX = this.location.x;
    const startY = this.location.y;
  
    // Let's get your exact, absolute unique ID that Udonarium uses for table lock checks
    let myPeerId = '';
    if (onlyMe) {
      if (PeerCursor.myCursor) {
        // In vanilla Udonarium, ownership matches 'peerId' or 'userId'. 
        // Let's grab whichever one is securely populated on your local cursor object.
        myPeerId = PeerCursor.myCursor.userId || PeerCursor.myCursor.peerId || '';
      }
    }
  
    cardsToSpread.forEach((card, index) => {
      const poppedCard = this.drawCard(); 
      
      if (poppedCard) {
        poppedCard.location.x = startX + (index * intervalX);
        poppedCard.location.y = startY;
        poppedCard.location.name = this.location.name;
  
        // Set the standard visibility states
        poppedCard.state = targetState;
        poppedCard.owner = onlyMe ? myPeerId : '';
  
        poppedCard.update();
      }
    });
  
    // FIX: Formally execute the component lifecycle destruction sequence.
    // This informs the network and table view tracking layers to drop the empty stack.
    this.destroy(); 
  }
  
  unifyCardsSize(size: number): void {
    for (const card of this.cards) {
      if (card.size !== size) card.size = size;
    }
  }

  putOnTop(card: Card): Card {
    if (!this.cardRoot) return null;
    if (!this.topCard) return this.putOnBottom(card);
    card.owner = '';
    card.zindex = 0;
    let delta = Math.abs(card.rotate - this.rotate);
    if (180 < delta) delta = 360 - delta;
    card.rotate = delta <= 90 ? 0 : 180;
    this.setSamePositionFor(card);
    return this.cardRoot.prependChild(card);
  }

  putOnBottom(card: Card): Card {
    if (!this.cardRoot) return null;
    card.owner = '';
    card.zindex = 0;
    let delta = Math.abs(card.rotate - this.rotate);
    if (180 < delta) delta = 360 - delta;
    card.rotate = delta <= 90 ? 0 : 180;
    this.setSamePositionFor(card);
    return this.cardRoot.appendChild(card);
  }

  toTopmost() {
    moveToTopmost(this, ['card']);
  }

  toBackmost() {
    moveToBackmost(this, ['card']);
  }

  // override
  setLocation(location: string) {
    super.setLocation(location);
    let cards = this.cards;
    for (let card of cards) card.setLocation(location);
  }

  private setSamePositionFor(card: Card) {
    card.location.name = this.location.name;
    card.location.x = this.location.x;
    card.location.y = this.location.y;
    card.posZ = this.posZ;
  }

  static create(name: string, identifier?: string): CardStack {
    let object: CardStack = null;

    if (identifier) {
      object = new CardStack(identifier);
    } else {
      object = new CardStack();
    }
    object.createDataElements();
    object.commonDataElement.appendChild(DataElement.create('name', name, {}, 'name_' + object.identifier));
    let cardRoot = new ObjectNode('cardRoot_' + object.identifier);
    cardRoot.setAttribute('name', 'cardRoot');
    cardRoot.initialize();
    object.appendChild(cardRoot);
    object.initialize();

    return object;
  }
}