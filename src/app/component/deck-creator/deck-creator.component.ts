import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Core Udonarium framework dependencies
import { CardStack } from '@udonarium/card-stack';
import { Card } from '@udonarium/card';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';
import { EventSystem } from '@udonarium/core/system/event/event-system';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';

// UI Service dependency
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
  public deckName: string = 'Custom Card Deck';
  public backIdentifier: string = '';
  public cardRows: DeckRow[] = [{ faceIdentifier: '', quantity: 1 }];

  // Picker modal and pipeline tracking states
  public showPicker: boolean = false;
  public pickerTarget: 'back' | number = 'back';
  public isProcessingFolder: boolean = false;

  public get uploadedImages() {
    return ImageStorage.instance.images || [];
  }

  constructor(private modalService: ModalService) {}

  ngOnInit(): void {}

  // Manual configuration controls
  public addRow(): void {
    this.cardRows.push({ faceIdentifier: '', quantity: 1 });
  }

  public removeRow(index: number): void {
    if (this.cardRows.length > 1) {
      this.cardRows.splice(index, 1);
    } else {
      // If it's the last row, reset it instead of deleting the input field completely
      this.cardRows = [{ faceIdentifier: '', quantity: 1 }];
    }
  }

  public getImageById(id: string) {
    return this.uploadedImages.find(img => img.identifier === id);
  }

  // Opens the visual engine asset inventory dialog
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

  // HTML5 directory upload logic
  public async onFolderSelected(event: any): Promise<void> {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(file => 
      file.type.startsWith('image/') || 
      /\.(png|jpe?g|webp|gif)$/i.test(file.name)
    );

    if (imageFiles.length === 0) {
      alert('No valid image files found inside the selected folder!');
      return;
    }

    this.isProcessingFolder = true;
    
    if (imageFiles[0].webkitRelativePath) {
      const folderName = imageFiles[0].webkitRelativePath.split('/')[0];
      if (folderName) this.deckName = folderName;
    }

    // Overwrite baseline structure with bulk folder contents
    this.cardRows = [];

    try {
      for (const file of imageFiles) {
        const registeredImage = await ImageStorage.instance.addAsync(file);
        if (registeredImage && registeredImage.identifier) {
          this.cardRows.push({
            faceIdentifier: registeredImage.identifier,
            quantity: 1 // Default quantity remains 1 for folder imports
          });
        }
      }
    } catch (error) {
      console.error('Error uploading folder elements:', error);
      alert('An error occurred while uploading folder files.');
    } finally {
      this.isProcessingFolder = false;
      event.target.value = ''; // Clean input element stream
    }
  }

  // Native deck production generation script
  public async generateDeck(): Promise<void> {
    if (!this.backIdentifier) {
      alert('Please select a Card Back image from the asset room!');
      return;
    }

    if (this.cardRows.length === 0) {
      alert('Your layout structure is empty! Click "Add Single Card" or load a folder.');
      return;
    }

    // Strict safety check: Ensure manual additions or imports aren't left unassigned
    for (let i = 0; i < this.cardRows.length; i++) {
      if (!this.cardRows[i].faceIdentifier || this.cardRows[i].faceIdentifier.trim() === '') {
        alert(`Row #${i + 1} is missing a Card Face image! Please assign an image asset to it or remove the row before generating.`);
        return;
      }
    }

    // Initialize Card Stack matching native createTramp factory architecture
    const cardStack = CardStack.create(this.deckName);
    cardStack.location.name = 'table';
    cardStack.location.x = 450;
    cardStack.location.y = 450;
    
    ObjectStore.instance.add(cardStack);

    let totalCardsCreated = 0;

    for (const row of this.cardRows) {
      for (let i = 0; i < row.quantity; i++) {
        const cardName = `${this.deckName}_Card_${totalCardsCreated + 1}`;
        const card = Card.create(cardName, row.faceIdentifier, this.backIdentifier);
        
        card.state = 1; // Deployed Face down inside stack
        card.location.name = 'table';

        ObjectStore.instance.add(card);
        cardStack.putOnTop(card);
        
        totalCardsCreated++;
      }
    }

    cardStack.update();
    EventSystem.call('SELECT_TABLETOP_OBJECT', { identifier: cardStack.identifier });
    
    alert(`Success! Generated "${this.deckName}" with ${totalCardsCreated} cards on the tabletop.`);
    this.modalService.resolve();
  }
}