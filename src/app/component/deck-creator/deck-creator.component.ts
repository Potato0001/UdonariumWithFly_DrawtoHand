import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Scoped package engine dependencies
import { CardStack } from '@udonarium/card-stack';
import { Card } from '@udonarium/card';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';
import { EventSystem } from '@udonarium/core/system/event/event-system';

// Exact import path for ObjectStore in your architecture
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';

// UI architecture service dependency
import { ModalService } from '../../service/modal.service';

interface DeckRow {
  faceIdentifier: string;
  quantity: number;
}

@Component({
  selector: 'deck-creator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deck-creator.component.html',
  styleUrls: []
})
export class DeckCreatorComponent implements OnInit {
  public deckName: string = 'Custom Deck';
  public backIdentifier: string = '';
  public cardRows: DeckRow[] = [{ faceIdentifier: '', quantity: 1 }];

  // State managers for visual image selection popups
  public showPicker: boolean = false;
  public pickerTarget: 'back' | number = 'back';

  // Expose uploaded room images safely to our view template
  public get uploadedImages() {
    return ImageStorage.instance.images || [];
  }

  constructor(private modalService: ModalService) {}

  ngOnInit(): void {}

  public addRow(): void {
    this.cardRows.push({ faceIdentifier: '', quantity: 1 });
  }

  public removeRow(index: number): void {
    if (this.cardRows.length > 1) {
      this.cardRows.splice(index, 1);
    }
  }

  // Helper to visually look up an image object by its unique ID string
  public getImageById(id: string) {
    return this.uploadedImages.find(img => img.identifier === id);
  }

  // Opens the visual grid picker overlay
  public openImagePicker(target: 'back' | number): void {
    this.pickerTarget = target;
    this.showPicker = true;
  }

  // Triggered when clicking a thumbnail inside our custom grid overlay
  public selectImage(identifier: string): void {
    if (this.pickerTarget === 'back') {
      this.backIdentifier = identifier;
    } else {
      this.cardRows[this.pickerTarget].faceIdentifier = identifier;
    }
    this.showPicker = false;
  }

  public async generateDeck(): Promise<void> {
    if (!this.backIdentifier) {
      alert('Please select a Card Back image from the asset room!');
      return;
    }

    const filledRows = this.cardRows.filter(row => row.faceIdentifier.trim() !== '');
    if (filledRows.length === 0) {
      alert('Please assign at least one Card Front image!');
      return;
    }

    // INSPIRED BY POKER: Use the native factory creator method for the stack
    const cardStack = CardStack.create(this.deckName);
    cardStack.location.name = 'table';
    cardStack.location.x = 400;
    cardStack.location.y = 400;
    
    // Register the stack container into the store first
    ObjectStore.instance.add(cardStack);

    let totalCardsCreated = 0;

    // Loop through custom configurations to populate cards
    for (const row of filledRows) {
      for (let i = 0; i < row.quantity; i++) {
        
        // INSPIRED BY POKER: Use Card.create() to instantiate metadata and images natively all at once!
        const cardName = `${this.deckName}_Card`;
        const card = Card.create(cardName, row.faceIdentifier, this.backIdentifier);
        
        card.state = 1; // 1 = Face down inside the stack pile
        card.location.name = 'table';

        // Register card to the synchronized store matrix
        ObjectStore.instance.add(card);
        
        // Drop it inside the stack container
        cardStack.putOnTop(card);
        
        totalCardsCreated++;
      }
    }

    // Final synchronization sweep to push dimensions and redraw textures
    cardStack.update();
    
    // Broadcast creation state across room contexts
    EventSystem.call('SELECT_TABLETOP_OBJECT', { identifier: cardStack.identifier });
    
    alert(`Success! Generated "${this.deckName}" with ${totalCardsCreated} cards on the table.`);
    this.modalService.resolve();
  }
}