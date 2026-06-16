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
  public deckName: string = 'Custom Folder Deck';
  public backIdentifier: string = '';
  public cardRows: DeckRow[] = [{ faceIdentifier: '', quantity: 1 }];

  // State managers for visual image selection popups
  public showPicker: boolean = false;
  public pickerTarget: 'back' | number = 'back';
  public isProcessingFolder: boolean = false;

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

  public getImageById(id: string) {
    return this.uploadedImages.find(img => img.identifier === id);
  }

  public openImagePicker(target: 'back' | number): void {
    this.pickerTarget = target;
    this.showPicker = true;
  }

  public selectImage(identifier: string): void {
    if (this.pickerTarget === 'back') {
      this.backIdentifier = identifier;
    } else {
      this.cardRows[this.pickerTarget].faceIdentifier = identifier;
    }
    this.showPicker = false;
  }

  // NEW: Handles picking a whole folder from your local machine
  public async onFolderSelected(event: any): Promise<void> {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;

    // Filter down to only image files (.png, .jpg, .jpeg, .webp, etc)
    const imageFiles = Array.from(files).filter(file => 
      file.type.startsWith('image/') || 
      /\.(png|jpe?g|webp|gif)$/i.test(file.name)
    );

    if (imageFiles.length === 0) {
      alert('No valid image files found inside the selected folder!');
      return;
    }

    this.isProcessingFolder = true;
    
    // Auto-detect a deck name from the parent folder name if available
    if (imageFiles[0].webkitRelativePath) {
      const folderName = imageFiles[0].webkitRelativePath.split('/')[0];
      if (folderName) this.deckName = folderName;
    }

    // Clear existing setup rows to make space for the bulk folder dump
    this.cardRows = [];

    try {
      for (const file of imageFiles) {
        // Core pipeline registration: Ingest file into Udonarium's cache structure
        const registeredImage = await ImageStorage.instance.addAsync(file);
        if (registeredImage && registeredImage.identifier) {
          // Push directly into our card configurations matrix
          this.cardRows.push({
            faceIdentifier: registeredImage.identifier,
            quantity: 1
          });
        }
      }
      alert(`Successfully imported ${this.cardRows.length} image files from folder into the template rows below!`);
    } catch (error) {
      console.error('Error importing directory contents:', error);
      alert('An error occurred while uploading some files from the directory.');
    } finally {
      this.isProcessingFolder = false;
      // Reset file input target so the same folder can be re-selected if needed
      event.target.value = '';
    }
  }

  public async generateDeck(): Promise<void> {
    if (!this.backIdentifier) {
      alert('Please select a Card Back image from the asset room!');
      return;
    }

    const filledRows = this.cardRows.filter(row => row.faceIdentifier.trim() !== '');
    if (filledRows.length === 0) {
      alert('Please assign or upload at least one Card Front image!');
      return;
    }

    // Use native factory creator pattern inspired by createTramp
    const cardStack = CardStack.create(this.deckName);
    cardStack.location.name = 'table';
    cardStack.location.x = 450;
    cardStack.location.y = 450;
    
    ObjectStore.instance.add(cardStack);

    let totalCardsCreated = 0;

    for (const row of filledRows) {
      for (let i = 0; i < row.quantity; i++) {
        const cardName = `${this.deckName}_Card_${totalCardsCreated + 1}`;
        const card = Card.create(cardName, row.faceIdentifier, this.backIdentifier);
        
        card.state = 1; // Face down inside the stack pile
        card.location.name = 'table';

        ObjectStore.instance.add(card);
        cardStack.putOnTop(card);
        
        totalCardsCreated++;
      }
    }

    cardStack.update();
    EventSystem.call('SELECT_TABLETOP_OBJECT', { identifier: cardStack.identifier });
    
    alert(`Success! Generated "${this.deckName}" with ${totalCardsCreated} cards on the table.`);
    this.modalService.resolve();
  }
}